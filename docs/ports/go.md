# Go implementation notes

The Go implementation lives in `go/` as one module, `github.com/notsuhas/envden/go`: core, adapters, CLI and server in one binary. The TypeScript implementation on `main` is the reference. Devices running either share one vault and one server, so both must agree on everything that is stored, sent or decided: wire bytes, crypto, server database state, files written (names, contents, modes), exit and error codes, accepted flags and arguments, prompts and their order and choices, and `--json` output. Terminal styling, prompt rendering, help layout, error wording and PDF bytes are native Go and compare by meaning. Remaining differences are in [go-parity.md](go-parity.md).

The parity harness, the transport comparison and the e2e script live on `main` and run against this binary locally with `bash parity/local/run.sh` on `main`. CI on this branch runs only Go's own checks: lint, tests, builds and the container.

## Rules

The code style, error, test and adapter rules in `CLAUDE.md` apply, in Go idiom:

- Tests are `*_test.go` files in the package they test, as Go requires, instead of a `__tests__/` folder.
- Errors are returned, not thrown: `errors.Wrap(code, message, cause)` from `go/core/errors`. The code matches TS; the message keeps the TS meaning and facts.
- Times are `int64` milliseconds passed in, never `time.Now()` in logic.
- Use maintained Go libraries for parsing, prompts, compression and the like. Never port an npm library by hand, and never hand-roll crypto.

## Building and checks

See `CLAUDE.md` for the commands. `./scripts/build-all.sh` cross-compiles the eight release platforms into `go/dist`. The dashboard embeds gzipped compiled assets and decompresses them for serving; the asset tests pin the served bytes.

## Adapters

Every adapter exists in TypeScript and in Go, and both must behave the same. In Go:

- The interface is in `go/core/adapters/<kind>.go`.
- The implementation is the package `go/adapters/<kind>/<impl>`, exporting `Create<Impl><Kind>Adapter`.
- The contract suite and fake are in `go/testing/<kind>`, and `contract_test.go` in the adapter package runs the suite.
- It is wired in `go/cli/adapters.go` or the server's `Serve`.

The contract cases match the TypeScript suites. A new case goes into both in the same change. Behaviour the contract can't see, such as file names and permissions, is checked by the parity harness.

## Translating TypeScript

- **Types.** `Uint8Array` is `[]byte`. `bigint` is `uint64`. Times are `int64` Unix milliseconds. `number` counts are `int`. Optional fields are pointers, or `nil` slices for bytes and lists.
- **Async.** Promises become plain calls returning `(T, error)`. Only use goroutines where TS runs work concurrently and the order is observable (`p-limit` scans).
- **Errors.** `throw new EnvdenError(code, msg, {cause})` is `return errors.Wrap(code, msg, cause)` from `core/errors`. Keep the code exactly and the message's meaning and facts. Never wrap an `*errors.Error` in `fmt.Errorf`, since the CLI only inspects the top error, like TS's `isEnvdenError`.
- **Non-Envden throws.** Where TS lets a plain `Error` escape to the user (for example `requireValue` messages, Node fs errors), keep its meaning, facts and exit code, and record wording gaps in [go-parity.md](go-parity.md).
- **Discriminated unions.** A struct with a `Kind string` and optional fields, falsy fields omitted.
- **Zod.** One Go struct per schema plus a decode function that rejects exactly what the Zod schema rejects (`strict()` objects reject unknown keys). Keep the schema in `core/protocol` when TS keeps it there.
- **JSON output.** `--json` output, state files and wire JSON must match `JSON.stringify` byte for byte: key order is TS insertion order (use ordered structs, not maps), `undefined` fields are omitted, numbers print like JS (`1e21` and above use exponent form, integers have no `.0`), strings escape like JS (no HTML escaping: use an encoder with `SetEscapeHTML(false)`). Pretty output uses 2-space indent.
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
| SQLite | `modernc.org/sqlite` | pure Go, so every platform cross-compiles without cgo. Close checkpoints with `TRUNCATE`, so a stopped server leaves only `envden.sqlite` |
| URL parsing | `github.com/nlnwa/whatwg-url` | TS uses the WHATWG `URL`; `net/url` normalizes differently |
| Commands, flags, help | `github.com/spf13/cobra` | the standard Go CLI library; envden normalizes argv first so the same flags and operands are accepted or rejected |
| Prompts, spinners | `github.com/charmbracelet/huh`, `bubbletea`, `bubbles` | maintained terminal prompts; the questions, their order and choices follow TS |
| PDF streams | `compress/zlib` | the recovery kit's FlateDecode streams; the PDF is compared by its text and Info fields |
| Byte sizes | `github.com/dustin/go-humanize` | the server status page |
| Terminal width | `github.com/charmbracelet/x/ansi` | string widths for history columns |
| UUIDs | `github.com/google/uuid` | identity keys, lock tokens and state records |
| Platform calls, terminals | `golang.org/x/sys`, `golang.org/x/term` | directory-relative symlink swaps (`*at` calls), process and OS checks, raw mode and terminal size, which the standard library lacks |
| PTY (tests only) | `github.com/creack/pty` | drives the prompts under a real terminal |

## Reference fixtures

Fixtures captured from the TypeScript code are committed under each package's `testdata` and replayed by the tests: protocol vectors, chain and merge traces, the 417-request server corpus with database snapshots, PDF text and the command behaviour table. The tests that regenerated them needed Bun and the TypeScript tree, so they are no longer in this branch; to regenerate a fixture, run its generator from history in a checkout that has `main` beside `go/`.

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

`go/scripts/build-all.sh` builds the same eight platforms as the TypeScript release, with the same asset names (`envden-darwin-arm64`, `envden-linux-x64-musl`, `envden-windows-x64.exe` and so on). Builds are static with `CGO_ENABLED=0`, so the musl targets need no separate toolchain. `ENVDEN_TELEMETRY_KEY` is baked in at build time. CI uploads the binaries as the `envden-go` artifact and builds the server image from `packaging/docker/Dockerfile` without publishing; see [releasing.md](../releasing.md).
