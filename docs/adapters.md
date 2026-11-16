# Writing an adapter

An adapter answers one question for envden: how devices reach the server, which repo a checkout belongs to, where keys live. Adapters are compiled into the binary and added by PR or fork (DESIGN § Decisions). Encryption, the sync protocol and merging are not adapters.

Work through this list in order.

## 1. Choose the kind

| Kind | Question | Used by |
|---|---|---|
| `network` | How do devices reach the server? | CLI |
| `repo` | Which repo is this checkout, and which env files does it have? | CLI |
| `storage` | Where does the server keep ciphertext? | server |
| `keychain` | Where does a device keep its keys? | CLI |
| `placement` | How does a store file appear in a checkout? | CLI |
| `shell` | How is the out-of-sync line installed in a shell? | CLI |

If your integration answers one of these, it is a new implementation of that kind. Go to step 3.

If it answers a different question, it is a new kind, and step 2 comes first. Check that it isn't crypto, sync or merge in disguise: those stay in core.

## 2. New kind only: trait, contract suite, fake

Add these before any implementation, in one PR:

- [ ] A trait `I<Kind>Adapter` in `rust/core/src/adapters/<kind>.rs`, re-exported from `adapters/mod.rs`.
- [ ] A contract suite, `<kind>_contract(factory)`, in `rust/testing/src/<kind>/contract.rs`.
- [ ] A fake, `create_fake_<kind>_adapter`, in `rust/testing/src/<kind>/`, with a test in `rust/testing/tests/fakes/<kind>.rs`.
- [ ] A row in the table in `docs/DESIGN.md` § Adapters.

Keep the trait small. Every method is something each future implementation must get right. Traits are synchronous.

## 3. Read the trait

The trait in `rust/core/src/adapters/<kind>.rs` is the whole job. Read the contract suite in `rust/testing/src/<kind>/contract.rs` next: it states the behaviour the types can't, such as which calls are safe to repeat and which must fail.

## 4. Create the crate

For `keychain one-password`, create `rust/adapters/keychain/one-password`:

- `Cargo.toml` naming the crate `envden-adapter-keychain-one-password`, taking `version`, `edition`, `license` and `publish` from the workspace, with `[lints] workspace = true`.
- `src/adapter.rs`, exporting `create_one_password_keychain_adapter`, which returns a type implementing `IKeychainAdapter`.
- `src/lib.rs`, which only declares modules and re-exports.
- `tests/contract.rs`, which runs the kind's contract suite.

Add the path to `members` in the root `Cargo.toml`. Start with every method returning `ErrorCode::NotImplemented` so the contract test starts red.

## 5. Make the contract test pass

- [ ] `tests/contract.rs` runs `envden_testing::<kind>::<kind>_contract`. This test is required.
- [ ] The factory builds your adapter against what the suite hands it: a temp directory, a scenario name, or a fixture. Take the home folder, the data folder and any command runner as arguments, so the test never touches the user's real keys, their home or a real tailnet.
- [ ] If the suite is missing a case every implementation of the kind should pass, add it to the suite. Cases only your adapter has go in your crate's own `tests/`.
- [ ] Time is an argument. No `SystemTime::now()` in the adapter.

An adapter depends only on `envden-core` (and `envden-protocol` where it needs protocol types), plus `envden-testing` as a dev-dependency.

## 6. Fakes

Callers test against fakes, not your adapter. `create_fake_<kind>_adapter(IFake<Kind>Adapter { ... })` from `envden-testing` takes the operations a test needs and panics on every other call.

- [ ] If you added a method to the trait, add it to the fake, and check in `rust/testing/tests/fakes/` that an unspecified operation panics.
- [ ] Don't write a second fake in an app's tests. Extend the shared one.

## 7. Wire it

Adapters are constructed in one file per app: `rust/cli/src/adapters.rs` or `rust/server/src/adapters.rs`.

- [ ] Add the crate as a path dependency of that app.
- [ ] Construct it there. Everything else receives adapters as arguments.

## 8. Report capabilities, don't branch on the adapter

Callers never ask which adapter they have. No matching on `id()`, no downcasting.

If callers need to act differently, put the difference on the trait and read it there. Existing examples: `IPlacementAdapter::mode` and `supported(dir)`, `IKeychainAdapter::owner_only()`, and the fields of `INetworkStatus`. `id` is for display and logs only.

A new capability is a trait change, so it also needs a contract case and a fake update.

## 9. Traps

- **Secrets in errors.** Return `EnvdenError` with a `code` and fixed message text, and keep the underlying error as its `source`. Never put env file contents, keys, tokens or passwords in a message, a log line or an error field. That includes command output you would otherwise echo. Use a length, count or hash.
- **Expected outcomes are not errors.** "Not found" and "not ready" are return values (`Option` or an enum). Return `Err` only for failures. Never panic on input.
- **Fail closed.** When a check can't be made, refuse. A network adapter that can't read its status reports not ready, and `expose` rejects. Placement refuses a path outside the checkout. A keychain that can't confirm a deletion fails.
- **Windows paths.** Build paths with `Path::join`, never by joining strings with `/`. Symlinks may be unavailable, and file modes mean nothing there: private files need ACLs.
- **Paths from outside.** A path that arrived from the server or a repo is input. Reject `..` and absolute paths, `symlink_metadata` before writing, and don't follow symlinks out of the checkout.
- **Commands.** Run external tools with an argument list through `envden_core::process`, never through a shell string. Take the runner as an argument so tests can replace it.
- **Repeats.** Install, remove and delete run twice must leave the same result as once.

## 10. Reference to copy

`rust/adapters/placement/fs` is the reference: a thin `adapter.rs` that maps the trait onto one file per operation, and a contract test that runs the suite once per mode.

For an adapter that wraps a command-line tool, read `rust/adapters/network/tailscale`. Its runner is an argument, so the contract test drives every scenario without Tailscale installed.

## Before the PR

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

The commit scope is `rust-` plus the crate name without `envden-`, for example `feat(rust-adapter-keychain-one-password): ...`.
