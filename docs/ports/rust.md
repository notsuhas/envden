# Rust port

The Rust port is a second implementation of envden, in behavioural parity with the TypeScript one. TypeScript at `v0.3.8` is the reference: where they differ, Rust is wrong, even when its behaviour looks better. Differences we'd like to fix go in `PARITY-NOTES.md`, and the fix lands in every implementation together.

## Layout

One Cargo workspace at the repo root. Crates mirror the TS packages:

| Crate | Path | TS counterpart |
|---|---|---|
| `envden-core` | `rust/core` | `packages/core/src/{errors,paths,release,site,process,merge,adapters}` |
| `envden-protocol` | `rust/protocol` | `packages/core/src/{protocol,chain}` |
| `envden-testing` | `rust/testing` | `packages/testing` |
| `envden-adapter-<kind>-<impl>` | `rust/adapters/<kind>/<impl>` | `packages/adapters/<kind>/<impl>` |
| `envden-server` | `rust/server` | `apps/server` |
| `envden-cli` (binary `envden`) | `rust/cli` | `apps/cli` |

`protocol` and `chain` are their own crate so they build and test apart from the rest of core. Module paths inside a crate follow the TS folders: `packages/core/src/protocol/codecs/entry.ts` becomes `rust/protocol/src/protocol/codecs/entry.rs`.

## Rules

CLAUDE.md applies, in idiomatic Rust:

- One thing per file, about 200 lines at most. A folder holds about 8 files before it splits. `mod.rs` only declares modules and re-exports.
- Interfaces become traits named `I<Name>`; type aliases `T<Name>`. Adapters are traits in `envden-core::adapters`, wired in one file per app (`rust/cli/src/adapters.rs`, `rust/server/src/adapters.rs`).
- Failures are `envden_core::errors::EnvdenError { code, message, source }`: fixed text, a code, the cause kept in `source`. Expected outcomes are enums.
- Never secrets in messages, logs or errors.
- Time is an argument. No `SystemTime::now()` outside the one clock at each app's edge; no sleeps in tests.
- Crypto comes from the libraries below, never hand-rolled.
- No `unsafe` unless a library forces it, with a one-line reason.
- `cargo fmt`, `cargo clippy --all-targets -- -D warnings` and `cargo test` stay clean.

## Tests

- Small pure-function tests live in a `#[cfg(test)] mod tests` at the bottom of the file they test.
- Tests that need a module's private items go in that module's `tests.rs` or `tests/` folder, declared `#[cfg(test)] mod tests;`. That folder is Rust's `__tests__`. Never put a test file beside source files under another name (`foo_tests.rs`).
- Tests of a crate's public API go in the crate's `tests/` folder.
- Protocol vectors are read in place from `packages/core/src/protocol/__tests__/vectors/`, so every implementation checks the same JSON.
- Every TS test case has a Rust counterpart with the same inputs and outcome.
- Tests never touch the real keychain, home config or tailnet.

## Libraries

| Use | Crate | Why |
|---|---|---|
| OPAQUE | `opaque-ke` 4.0.1, `argon2` 0.5.3, `sha2` 0.10 | `@serenity-kit/opaque` 1.1.0 is a wasm build of exactly these, with suite Ristretto255 / TripleDH(SHA-512) / Argon2id KSF |
| Hash, MAC, KDF | `sha2`, `hmac`, `hkdf` | RustCrypto |
| XChaCha20-Poly1305 | `chacha20poly1305` | RustCrypto |
| Ed25519 | `ed25519-dalek` for signing, `ed25519-zebra` with canonical point checks for verification | matches noble `zip215: false` |
| X25519 | `x25519-dalek` | |
| HPKE | `hpke` 0.13.0, vendored in `rust/vendor/hpke` with a small patch | RFC 9180. TS uses raw random bytes as the ephemeral key; the patch exposes the crate's own fixed-ephemeral encapsulation so wraps match (`ENVDEN-PATCH.md`) |
| Argon2id | `argon2` | RustCrypto |
| Zeroizing secrets | `zeroize` | wipes key material on every exit path, where TS calls `fill(0)` |
| Unicode | `unicode-normalization`, `unicode-general-category`, `unicode-width`, `icu_collator` | NFC/NFKC and the Cc/Cf checks the protocol needs, terminal column widths, and `localeCompare` ordering |
| Server HTTP | `tokio`, `axum`, `hyper` | Hono on `Bun.serve` becomes axum on hyper, with Bun's idle and header timeouts |
| Server storage | `rusqlite` (bundled SQLite) | same schema, pragmas and on-disk files as `bun:sqlite` |
| CLI HTTP | `ureq` | the CLI is synchronous; parallel repo checks use threads |
| Terminal | `crossterm` | raw mode and keys; the bytes written copy `@clack/prompts` 1.9.0 |
| PDF compression | `libz-sys` (static C zlib) | pdf-lib deflates with pako, which matches C zlib byte for byte; the recovery kit PDF is identical |
| Dates | `chrono`, `chrono-tz` | date-fns formatting |
| Processes | `shared_child`, `rustix`, `nix`, `windows-sys` | trusted spawning, lock liveness checks, file access checks and Windows ownership, with no hand-written `unsafe` outside Windows FFI |
| Errors | `thiserror` | |

## Mapping

Each TS folder has a Rust module at the same relative path, so `apps/cli/src/sync/local/reconcile.ts` is `rust/cli/src/sync/local/reconcile.rs`. Where Rust needs a different shape, the difference is local:

- Zod schemas in `packages/core/src/protocol` are serde types in `envden-protocol` with the same JSON keys and checks.
- Adapter interfaces are synchronous traits. The server calls storage behind a mutex, and the CLI uses threads where TS awaits in parallel.
- Commander and clack are not used: `rust/cli/src/program` and `rust/cli/src/output/prompts` copy their output, help and errors.
- `envden serve` in the CLI calls `envden_server::serve`, as the TS CLI imports `@envden/server`.
- JS `trim()` strips different characters from Rust's `str::trim`. Use `envden_core::text::js_trim` wherever TS trims.

## CLI foundation

- `program::parse(command_tree(), args)` returns help, version, an error, or an `IInvocation`.
- Implement `ICommandActions::run` to dispatch a command path; pass it to `program::dispatch`.
- Keep parsing and help metadata in `program`; actions live under `commands/<domain>`.
- `ICommandHooks` supplies pre-action notices and outcome reporting; notice failures are ignored.
- Use `output::{print, print_error, terminal_json}` and `output::prompts` for terminal output.
- Use `state::repository::{load_state, save_state}`; state preserves tagged JSON collections.
- Use `state::lock::with_state_lock` for read-modify-write operations; nested calls share ownership.
- `adapters::IAdapters` holds adapters and factories; keep all concrete adapter imports there.
- `adapters.now` is the injected millisecond clock; `main` owns the system clock.
- `settings` handles config validation, persistence and rendering; `store::store_path` names files.
- `ENVDEN_CAPTURE_HELP=1 cargo test -p envden-cli --test help` refreshes fixtures from the TS binary.
