# Go port

The Go port lives in `go/` as one module, `github.com/notsuhas/envden/go`. It implements core, adapters, CLI and server; the site stays TypeScript. TypeScript at `v0.3.8` is the reference.

## Why exact parity

Devices running different implementations share one vault and one server, so they must agree on every byte. Every implementation must produce the same stdout, stderr, exit codes, files and permissions, server database rows and wire bytes as TypeScript, bugs included. A port that behaves "better" still fails. Rejected: letting implementations differ in "harmless" output such as wording or JSON key order, since scripts and agents parse both.

A fix or improvement found while porting goes in [go-parity.md](go-parity.md) and lands in every implementation in the same PR, never in Go alone. The same goes for any behaviour change.

`parity/` checks this as a black box (see [parity.md](parity.md)): it runs each scenario against two binaries in throwaway homes and diffs everything they produce, with random values mapped to placeholders. CI runs it on every push to `port/go`, plus mixed setups (a TS device and a Go device in one vault, each CLI against the other's server) and `apps/cli/scripts/e2e.ts` unchanged against the Go binary. Byte-level vectors in `packages/core/src/protocol/__tests__/vectors` gate the crypto.

## Rules

The code style, error, test and adapter rules in `AGENTS.md` apply, in Go idiom:

- Tests are `*_test.go` files in the package they test, as Go requires, instead of a `__tests__/` folder.
- Errors are returned, not thrown: `errors.Wrap(code, message, cause)` from `go/core/errors`, with the TS message text.
- Times are `int64` milliseconds passed in, never `time.Now()` in logic.
- Go forbids import cycles, so a CLI file goes where [go-cli-layout.md](go-cli-layout.md) puts it, even when its TS folder differs. `python3 scripts/ports/check-cli-layout.py --layers` checks the layering.

## Building and checks

Go 1.26. Keep caches in the worktree:

```sh
cd go
export GOMODCACHE=$PWD/../.cache/gomod GOCACHE=$PWD/../.cache/gobuild GOFLAGS=-modcacherw
go build -o dist/envden ./cmd/envden   # one binary, CLI and server
gofmt -l . && go vet ./... && golangci-lint run ./...
go test ./...
./scripts/build-all.sh                 # the eight release platforms, into go/dist
```

The parity suite needs Bun, Git and the TypeScript build. From the repo root:

```sh
bun run --cwd apps/cli build
bun parity/run.ts --reference apps/cli/dist/envden --candidate go/dist/envden
bun apps/cli/scripts/e2e.ts go/dist/envden
```

`--server-binary` and `--device-binary` mix the two implementations in one run.

The dashboard embeds gzipped compiled assets and decompresses them for serving; the asset tests pin the original served bytes.

## Layout and TS mapping

| Go | TS |
|---|---|
| `core/errors` | `packages/core/src/errors` |
| `core/adapters` | `packages/core/src/adapters` (interfaces, env-file rules, commit prep) |
| `core/protocol/...` | `packages/core/src/protocol/...`, one Go package per TS folder |
| `core/chain/...` | `packages/core/src/chain` |
| `core/merge`, `core/paths`, `core/process`, `core/release` | same names |
| `adapters/<kind>/<impl>` | `packages/adapters/<kind>/<impl>` |
| `testing/...` | `packages/testing` (fakes and contract suites) |
| `server/...` | `apps/server/src` |
| `cli/...` | `apps/cli/src`, mapped file by file in [go-cli-layout.md](go-cli-layout.md) |
| `cmd/envden` | `apps/cli/src/main.ts` |
| `lib/...` | npm libraries whose output reaches the user (see below) |

A TS folder becomes a Go package with the same name, unless the name is a Go keyword or clashes, in which case add a suffix. Folder size and file rules from `AGENTS.md` apply: one thing per file, about 200 lines max, about 8 files per folder.

## Adapters

Every adapter exists in TypeScript and in Go, and both must behave the same. In Go:

- The interface is in `go/core/adapters/<kind>.go`.
- The implementation is the package `go/adapters/<kind>/<impl>`, exporting `Create<Impl><Kind>Adapter`.
- The contract suite and fake are in `go/testing/<kind>`, and `contract_test.go` in the adapter package runs the suite.
- It is wired in `go/cli/adapters.go` or the server's `Serve`.

Port the TypeScript contract cases as they are. A new case goes into both suites in the same PR. Behaviour the contract can't see, such as file names and permissions, is checked by the parity suite.

## Translating TypeScript

- **Types.** `Uint8Array` is `[]byte`. `bigint` is `uint64`. Times are `int64` Unix milliseconds. `number` counts are `int`. Optional fields are pointers, or `nil` slices for bytes and lists.
- **Async.** Promises become plain calls returning `(T, error)`. Only use goroutines where TS runs work concurrently and the order is observable (`p-limit` scans).
- **Errors.** `throw new EnvdenError(code, msg, {cause})` is `return errors.Wrap(code, msg, cause)` from `core/errors`. Keep the TS message text exactly; it reaches the user. Never wrap an `*errors.Error` in `fmt.Errorf`, since the CLI only inspects the top error, like TS's `isEnvdenError`.
- **Non-Envden throws.** Where TS lets a plain `Error` escape to the user (for example `requireValue` messages, Node fs errors), reproduce the exact message text. Where that's impossible (Node's errno text), match it as closely as possible and record the gap in [go-parity.md](go-parity.md).
- **Discriminated unions.** A struct with a `Kind string` and optional fields, falsy fields omitted.
- **Zod.** One Go struct per schema plus a decode function that rejects exactly what the Zod schema rejects (`strict()` objects reject unknown keys). Keep the schema in `core/protocol` when TS keeps it there.
- **JSON output.** Must match `JSON.stringify` byte for byte: key order is TS insertion order (use ordered structs, not maps), `undefined` fields are omitted, numbers print like JS (`1e21` and above use exponent form, integers have no `.0`), strings escape like JS (no HTML escaping: use an encoder with `SetEscapeHTML(false)`). Pretty output uses 2-space indent.
- **Time.** No `time.Now()` in logic; take `now int64` or `now func() int64` as TS does.
- **Randomness.** Functions that take `rng` in TS take `rng func(n int) []byte` in Go, defaulting to `crypto/rand`.
- **Unicode.** NFC/NFKC via `golang.org/x/text/unicode/norm`. JS string length is UTF-16 code units; use `utf16` counting wherever TS uses `.length` on text.

## Libraries

| Use | Library | Why |
|---|---|---|
| SHA-256, HMAC, HKDF | Go standard library | RFC implementations in the standard library |
| XChaCha20-Poly1305, Argon2id | `golang.org/x/crypto` | maintained by the Go team |
| Ed25519 | `crypto/ed25519` to sign, `github.com/hdevalence/ed25519consensus` to verify, `filippo.io/edwards25519` for canonical and small-order checks | noble verifies with the cofactored equation even with `zip215: false`, which only makes encodings strict; ed25519consensus checks that equation and S < L, and envden's own checks keep A and R canonical |
| X25519, HPKE | `crypto/ecdh`, `crypto/hpke` (Go 1.26) | RFC 9180 in the standard library; rejects all-zero shared secrets |
| OPAQUE | `github.com/bytemare/opaque` v0.18.0, RFC 9807, ristretto255-SHA512, Argon2id KSF with a 16-byte zero salt, `t=3, m=65536, p=4`, 64-byte output | reproduces `@serenity-kit/opaque` 1.1.0 (`opaque-ke` 4) byte for byte against the stored vectors |
| Unicode normalization and case | `golang.org/x/text` | its tables are Unicode 15, Bun's ICU is newer; the gaps are in [go-parity.md](go-parity.md) |
| SQLite | `modernc.org/sqlite` | pure Go, so every platform cross-compiles without cgo. On darwin it turns on persistent WAL and truncates the WAL on close, because Bun links Apple's SQLite there, which keeps empty `-wal` and `-shm` files after shutdown |
| URL parsing | `github.com/nlnwa/whatwg-url` | TS uses the WHATWG `URL`; `net/url` normalizes differently |
| Terminal width | `github.com/charmbracelet/x/ansi` | string widths for the line editor and history columns |
| UUIDs | `github.com/google/uuid` | identity keys, lock tokens and state records |
| Platform calls, terminals | `golang.org/x/sys`, `golang.org/x/term` | directory-relative symlink swaps (`*at` calls), process and OS checks, raw mode and terminal size, which the standard library lacks |
| PTY (tests only) | `github.com/creack/pty` | drives clack under a real terminal |

### In-tree ports of npm libraries

`go/lib` holds ports of the npm libraries whose output the user sees. No Go library produces the same bytes, so each is ported from its JS source, keeps its license, and is tested against fixtures captured from the JS library:

- `commander`: parsing, help text, errors and suggestions.
- `clack`: prompts, spinners, logs and frames, including `block()`, which stops typed input from echoing while a spinner runs.
- `datefns`: the `date-fns` formatting and durations envden uses.
- `prettybytes`: byte sizes.
- `pako`: the deflater `pdf-lib` uses, so recovery kit PDFs match byte for byte.

## Reference fixtures

Fixtures captured from the TS code are committed under each package's `testdata`. The tests that regenerate them, and the live comparisons, only run with `ENVDEN_TS_PARITY=1` and need Bun and the installed workspace dependencies:

```sh
cd go
ENVDEN_TS_PARITY=1 go test ./... -run 'TestRegenerate' -count=1
ENVDEN_TS_PARITY=1 go test -count=1 -run 'Bun|TypeScriptParity|PDFLibLive' ./server ./cli/vault/recovery/pdf
```

Most packages name the test `TestRegenerateReference`; `lib/commander` adds `TestRegenerateDispatchReference` and `lib/clack` `TestRegenerateSpinnerPTYReference`. The second line compares against a running Bun server and pdf-lib, as CI does. See [go-server-parity.md](go-server-parity.md) for the server request corpus.

### OPAQUE state formats

serenity-kit serializes `opaque-ke` state. Go reads and writes the same bytes:

- `serverSetup` (128) = OPRF seed (64) ‖ server private key (32) ‖ dummy public key (32). Logins for an unknown user build their fake record from the dummy public key, a fresh masking key and a zero envelope, as `opaque-ke` 4 does.
- `clientRegistrationState` (64) = blind (32) ‖ blinded element (32).
- `clientLoginState` (192) = blind (32) ‖ KE1 (96) ‖ client ephemeral private key (32) ‖ client nonce (32).
- `serverLoginState` (128) = session key (64) ‖ expected client MAC (64).

A finish call resumes from these with `ClientOptions{OPRFBlind, ResumePassword, ResumeKE1, AKE.SecretKeyShare}` and `KSFSalt = 16 zero bytes`, `KSFParameters = {3, 65536, 4}`, `KSFLength = 64`.

### HPKE vectors

`crypto/hpke` can't take an injected ephemeral key, so Go checks the wrap vectors by opening them and by checking that `enc` is the public key of the vector's ephemeral seed. Production wraps use a fresh ephemeral key, as TS does.

## Releases

`go/scripts/build-all.sh` cross-compiles the same eight platforms as the TS release, with the same asset names (`envden-darwin-arm64`, `envden-linux-x64-musl`, `envden-windows-x64.exe` and so on). Builds are static with `CGO_ENABLED=0`, so the musl targets need no separate toolchain. `ENVDEN_TELEMETRY_KEY` is baked in the same way. Pass target names to build a subset.

CI uploads the binaries as the `envden-go` workflow artifact. Signing, notarization, `SHA256SUMS`, GitHub releases, Homebrew, Scoop, npm and Docker publishing stay off for the port. Turning them on would follow [releasing.md](../releasing.md) with these binaries in place of Bun's.
