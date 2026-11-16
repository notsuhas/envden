# Working on envden (Rust)

## Where things are

- **Spec:** `docs/PROTOCOL.md` is the source of truth for anything cryptographic. `docs/DESIGN.md` covers product behaviour and, under Decisions, the choices made and the options rejected. Terms are in `docs/CONTEXT.md`. Releases are in `docs/releasing.md`.
- **Reference:** the TypeScript build on `main` is the reference implementation. This port behaves identically; the parity suite on `main` checks it, and `docs/implementations.md` there lists the accepted differences.
- **Crates:** one Cargo workspace. `rust/core` holds errors, paths, merge and the adapter traits. `rust/protocol` holds codecs, crypto and the chain. Each adapter is its own crate in `rust/adapters/<kind>/<impl>`. `rust/testing` holds contract suites and fakes. `rust/cli` (binary `envden`) and `rust/server` are the apps. `rust/vendor` holds patched copies of `cliclack` and `hpke`; each has an `ENVDEN-PATCH.md`.

## Checks

```sh
export CARGO_INCREMENTAL=0 CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Enable the pre-commit hook (fmt and clippy) once per clone: `git config core.hooksPath .githooks`.

## Code style

- **No god files.** Each file does one thing: one codec, one helper, one command. `mod.rs` and `lib.rs` only declare modules and re-export. Split any file that holds unrelated pieces or grows past roughly 200 lines.
- **Group related files in folders.** Name folders after the domain: `commands/device/{add,ls,rm}.rs`, not `device_add.rs`. Once a folder passes about 8 files, split it into subfolders.
- **Let code breathe.** Blank lines between items and between the logical steps inside a function.
- **Naming:** traits and structs that describe an interface are `I<Name>`, never with a `Props` suffix. Type aliases are `T<Name>`.
- **Visibility:** `pub` only what other crates use; `pub(crate)` for what other modules use.
- **Comments:** one line at most, and only for a non-obvious "why". No doc essays and no legend comments on enums.
- **Decisions:** derive them in pure functions, each with a compact test.
- **No deprecated APIs.**
- **`unsafe`** is denied workspace-wide. Only Windows FFI may allow it, with a one-line reason.
- **Crypto:** never hand-roll primitives. Use the pinned crates in `rust/protocol`.
- **Text:** use `envden_core::text::js_trim` where the protocol trims, not `str::trim`.

## Commits and reviews

- **Commits follow [Conventional Commits](https://www.conventionalcommits.org):** `type(scope): summary`, lowercase and imperative. Types are `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci` and `perf`. The scope is the crate with a `rust-` prefix: `rust-cli`, `rust-server`, `rust-core`, `rust-protocol`, `rust-testing`, or an adapter such as `rust-adapter-storage-sqlite`. Use `rust-adapters` for a change spanning several adapters and `rust` for the whole workspace. Mark breaking changes with `!`.
- **Review comments follow [Conventional Comments](https://conventionalcomments.org):** `label (decorations): subject`.

## Crates and dependencies

- **Layers:** `core` depends on no workspace crate. `protocol` depends only on `core`. An adapter depends only on `core` (and `protocol` where it needs protocol types), plus `testing` as a dev-dependency. Apps depend on core, protocol and adapters.
- **Wiring:** adapters are constructed in one file per app, `rust/cli/src/adapters.rs` and `rust/server/src/adapters.rs`. Everything else receives them as arguments.
- **Never branch on which adapter is in use.** Add a capability to the trait and read that.
- **Moves:** moving a file deletes the old one and updates every user. No re-export shims.

## Adapters

- One crate per implementation at `rust/adapters/<kind>/<impl>`, named `envden-adapter-<kind>-<impl>`.
- `src/adapter.rs` exports `create_<impl>_<kind>_adapter`, returning a type that implements the core `I<Kind>Adapter`.
- Every adapter has `tests/contract.rs` running its kind's suite from `envden-testing`. A new kind adds its suite there first.
- Fakes live in `envden-testing`. A fake panics on any call the test didn't supply.
- Read `docs/adapters.md` before adding one.

## Errors

- **Expected outcomes are return values:** an enum or `Option`, never an error.
- **Failures are `EnvdenError`** with an `ErrorCode`. The message is fixed text, and the underlying error goes in `source`.
- **Never put env file contents, keys, tokens or passwords in a message, log line or error field.** Use a length, count or hash.
- **No panics on input.** `unwrap` and `expect` only where the invariant is local and obvious.
- **Translate once.** The CLI maps `code` to an exit code in `main.rs`, and the server maps it to a status in one place.

## Commands and routes

- A CLI command or server route does three things: parse input, call one function, report the result. Logic lives in that function, so a test can call it without a terminal or a socket.
- Anything on the wire has one serde type in `rust/protocol`. Never declare a shape twice.

## Tests

- **Where:** small pure-function tests sit in a `#[cfg(test)] mod tests` at the bottom of the file. Tests that need a module's private items go in that module's `tests.rs` or `tests/` folder. Tests of a crate's public API go in the crate's `tests/` folder. Never put a test file beside sources under another name (`foo_tests.rs`).
- **Fixtures** (protocol vectors, recorded tool output, databases written by the reference) live in the crate's `tests/fixtures/`. Tests never read outside their crate or spawn another runtime.
- **Test what can break:** codecs against vectors, crypto compositions, merge, storage commits, path validation, and whatever a bug fix changed. Skip what types guarantee.
- **Extend before you add.** Add a row or assertion to an existing test when one fits.
- **Bug fixes** start with a test that fails without the fix.
- **Time is an argument.** No `SystemTime::now()` outside the one clock at each app's edge, no sleeps or polling in logic or tests.
- **No `#[ignore]`** without an issue link on the line above.
- **Tests never touch the real keychain, the user's home config, a real tailnet or a real service manager** (launchd, systemd, schtasks). Use temp dirs and fakes, and pass homes explicitly rather than reading `HOME` or `ENVDEN_HOME`.

## Suppressions

- Every `#[allow(...)]` and `#[expect(...)]` says why on the line above.
- Don't relax `[workspace.lints]` to get past a check. Fix the code.

## Docs and work artifacts

- Docs hold decisions and constraints the code can't show. Don't list files, fields or control flow.
- When a decision changes, rewrite the affected text and its entry under `docs/DESIGN.md` § Decisions, saying what it replaced.
- Use the terms in `docs/CONTEXT.md` in identifiers, messages and docs.
- Don't commit plans, research notes or scratch files.
