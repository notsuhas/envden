# Go port

The Go port lives in `go/` as one module, `github.com/notsuhas/envden/go`. TypeScript at `v0.3.8` is the reference: Go must match it byte for byte in stdout, stderr, exit codes, files written, server database state and wire bytes, bugs included. Differences we'd like to fix later go in `PARITY-NOTES.md`, never only into Go.

## Building

Go 1.26. Keep caches in the worktree:

```sh
cd go
export GOMODCACHE=$PWD/../.cache/gomod GOCACHE=$PWD/../.cache/gobuild GOFLAGS=-modcacherw
go build -o dist/envden ./cmd/envden
go test ./...
```

Regenerate committed TS reference fixtures with `cd go && ENVDEN_TS_PARITY=1 go test ./... -run TestRegenerateReference -count=1` using the cache settings above; this needs Bun and the installed workspace dependencies.

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
| `cli/...` | `apps/cli/src` |
| `cmd/envden` | `apps/cli/src/main.ts` |

A TS folder becomes a Go package with the same name, unless the name is a Go keyword or clashes, in which case add a suffix (`protocol/keys` stays, `chain/devices` stays). Folder size and file rules from `CLAUDE.md` apply: one thing per file, about 200 lines max, about 8 files per folder.

## Translating TypeScript

- **Types.** `Uint8Array` is `[]byte`. `bigint` is `uint64`. Times are `int64` Unix milliseconds. `number` counts are `int`. Optional fields are pointers, or `nil` slices for bytes and lists.
- **Async.** Promises become plain calls returning `(T, error)`. Only use goroutines where TS runs work concurrently and the order is observable (`p-limit` scans).
- **Errors.** `throw new EnvdenError(code, msg, {cause})` is `return errors.Wrap(code, msg, cause)` from `core/errors`. Keep the TS message text exactly; it reaches the user. Never wrap an `*errors.Error` in `fmt.Errorf`, since the CLI only inspects the top error, like TS's `isEnvdenError`.
- **Non-Envden throws.** Where TS lets a plain `Error` escape to the user (for example `requireValue` messages, Node fs errors), reproduce the exact message text. Where that's impossible (Node's errno text), match it as closely as possible and record the gap in `PARITY-NOTES.md`.
- **Discriminated unions.** A struct with a `Kind string` and optional fields, falsy fields omitted.
- **Zod.** One Go struct per schema plus a decode function that rejects exactly what the Zod schema rejects (`strict()` objects reject unknown keys). Keep the schema in `core/protocol` when TS keeps it there.
- **JSON output.** Must match `JSON.stringify` byte for byte: key order is TS insertion order (use ordered structs, not maps), `undefined` fields are omitted, numbers print like JS (`1e21` and above use exponent form, integers have no `.0`), strings escape like JS (no HTML escaping: use an encoder with `SetEscapeHTML(false)`). Pretty output uses 2-space indent.
- **Time.** No `time.Now()` in logic; take `now int64` or `now func() int64` as TS does. Formatting with `date-fns` must produce the same text.
- **Randomness.** Functions that take `rng` in TS take `rng func(n int) []byte` in Go, defaulting to `crypto/rand`.
- **Unicode.** NFC/NFKC via `golang.org/x/text/unicode/norm`. JS string length is UTF-16 code units; use `utf16` counting wherever TS uses `.length` on text.

## Libraries

| Use | Library | Why |
|---|---|---|
| SHA-256, HMAC, HKDF | Go standard library (`crypto/sha256`, `crypto/hmac`, `crypto/hkdf`) | RFC implementations in the standard library |
| XChaCha20-Poly1305, Argon2id | `golang.org/x/crypto` | maintained by the Go team |
| Ed25519 | `crypto/ed25519` to sign, `github.com/hdevalence/ed25519consensus` to verify, `filippo.io/edwards25519` for canonical and small-order checks | noble verifies with the cofactored equation even with `zip215: false`, which only makes encodings strict; ed25519consensus checks that equation and S < L, and envden's own checks keep A and R canonical |
| X25519, HPKE | `crypto/ecdh`, `crypto/hpke` (Go 1.26) | RFC 9180 in the standard library; rejects all-zero shared secrets |
| OPAQUE | `github.com/bytemare/opaque` v0.18.0, RFC 9807, ristretto255-SHA512, Argon2id KSF with a 16-byte zero salt, `t=3, m=65536, p=4`, 64-byte output | reproduces `@serenity-kit/opaque` 1.1.0 (`opaque-ke` 4) byte for byte against the stored vectors |
| Unicode normalization | `golang.org/x/text` | |
| SQLite | `modernc.org/sqlite` | pure Go, so every platform cross-compiles without cgo |
| PTY (tests and harness only) | `github.com/creack/pty` | |

### OPAQUE state formats

serenity-kit serializes `opaque-ke` state. Go reads and writes the same bytes:

- `serverSetup` (128) = OPRF seed (64) ‖ server private key (32) ‖ fake-record private key (32).
- `clientRegistrationState` (64) = blind (32) ‖ blinded element (32).
- `clientLoginState` (192) = blind (32) ‖ KE1 (96) ‖ client ephemeral private key (32) ‖ client nonce (32).
- `serverLoginState` (128) = session key (64) ‖ expected client MAC (64).

A finish call resumes from these with `ClientOptions{OPRFBlind, ResumePassword, ResumeKE1, AKE.SecretKeyShare}` and `KSFSalt = 16 zero bytes`, `KSFParameters = {3, 65536, 4}`, `KSFLength = 64`.

### HPKE vectors

`crypto/hpke` can't take an injected ephemeral key, so Go checks the wrap vectors by opening them and by checking that `enc` is the public key of the vector's ephemeral seed. Production wraps use a fresh ephemeral key, as TS does.
