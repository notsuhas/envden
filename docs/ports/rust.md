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
- Larger suites go in the crate's `tests/` folder, one file per TS `__tests__` file they port.
- Protocol vectors are read in place from `packages/core/src/protocol/__tests__/vectors/`, so both implementations check the same JSON.
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
| Errors | `thiserror` | |

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
