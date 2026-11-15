# Writing an adapter

An adapter answers one question for envden: how devices reach the server, which repo a checkout belongs to, where keys live. Adapters are compiled into the binary and added by PR or fork (DESIGN § Decisions). Encryption, the sync protocol and merging are not adapters.

Every adapter exists in each implementation: TypeScript under `packages/adapters/<kind>/<impl>`, Rust under `rust/adapters/<kind>/<impl>` (see [ports/rust.md](ports/rust.md)). Write the TypeScript one first, then port it; the parity suite must stay green. Work through this list in order.

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

## 2. New kind only: interface, contract suite, fake

Add these before any implementation, in one PR:

- [ ] `I<Kind>Adapter` in `packages/core/src/adapters/<kind>.ts`, exported from the folder's `index.ts`.
- [ ] A contract suite, `<kind>Contract(name, factory)`, in `packages/testing/src/<kind>/contract.ts`.
- [ ] A fake, `createFake<Kind>Adapter`, beside it, added to the list in `packages/testing/__tests__/fakes.test.ts`.
- [ ] A `./<kind>` subpath export in `packages/testing/package.json`.
- [ ] A row in the table in `docs/DESIGN.md` § Adapters.

Keep the interface small. Every method is something each future implementation must get right.

## 3. Read the interface

The interface in `packages/core/src/adapters/<kind>.ts` is the whole job. Read the contract suite next to it in `packages/testing/src/<kind>/contract.ts`: it states the behaviour the types can't, such as which calls are safe to repeat and which must fail.

## 4. Create the package

```sh
bun scripts/new-adapter.ts <kind> <impl>
bun install
```

`<kind>` is one lowercase word and `<impl>` is kebab-case. For `keychain one-password` this creates:

- `packages/adapters/keychain/one-password`, named `@envden/adapter-keychain-one-password`
- `src/adapter.ts`, exporting `createOnePasswordKeychainAdapter`, which returns `IKeychainAdapter`
- `src/index.ts`, which only re-exports it
- `src/__tests__/contract.test.ts`, which runs the kind's contract suite

`bun install` links the new workspace package. The generated adapter throws `NOT_IMPLEMENTED`, so the contract test starts red.

The template lives in `packaging/templates/adapter`. `base/` applies to every kind, and `kinds/<kind>/` replaces files for kinds whose contract suite needs more setup.

## 5. Make the contract test pass

- [ ] `src/__tests__/contract.test.ts` runs `<kind>Contract` from `@envden/testing/<kind>`. This test is required: `packages/testing` fails if an adapter package has none.
- [ ] The factory builds your adapter against what the suite hands it: a temp directory, a scenario name, or a fixture. Take the home folder, the data folder and any command runner as arguments, so the test never touches the user's real keys, their home or a real tailnet.
- [ ] If the suite is missing a case every implementation of the kind should pass, add it to the suite. Cases only your adapter has go in your own `__tests__/`.
- [ ] Time is an argument. No `Date.now()` in the adapter.

An adapter imports only `@envden/core`, plus `@envden/testing` in tests. Lint and Fallow enforce this.

## 6. Fakes

Callers test against fakes, not your adapter. `createFake<Kind>Adapter({ ... })` from `@envden/testing/<kind>` takes the operations a test needs and throws on every other call.

- [ ] If you added a method to the interface, add it to the fake. `packages/testing/__tests__/fakes.test.ts` checks that every unspecified operation throws.
- [ ] Don't write a second fake in an app's tests. Extend the shared one.

## 7. Wire it

Adapters are constructed in one file per app: `apps/cli/src/adapters.ts` or `apps/server/src/adapters.ts`.

- [ ] Add the package to that app's `package.json` as `"workspace:*"` and run `bun install`.
- [ ] Construct it in `createAdapters`. Everything else receives adapters as arguments.

Until it is wired, Fallow reports the factory as unused.

## 8. Report capabilities, don't branch on the adapter

Callers never ask which adapter they have. No `adapter.id === "tailscale"`, no `instanceof`.

If callers need to act differently, put the difference on the interface and read it there. Existing examples: `IPlacementAdapter.mode` and `supported(dir)`, `IKeychainAdapter.ownerOnly()`, and the fields of `INetworkStatus`. `id` is for display and logs only.

A new capability is an interface change, so it also needs a contract case and a fake update.

## 9. Traps

- **Secrets in errors.** Throw `EnvdenError` with a `code` and fixed message text, and put the underlying error in `cause`. Never put env file contents, keys, tokens or passwords in a message, a log line or an error field. That includes command output you would otherwise echo. Use a length, count or hash.
- **Expected outcomes are not errors.** "Not found" and "not ready" are return values. Throw only for failures.
- **Fail closed.** When a check can't be made, refuse. A network adapter that can't read its status reports not ready, and `expose` rejects. Placement refuses a path outside the checkout. A keychain that can't confirm a deletion throws.
- **Windows paths.** Build paths with `node:path`, never by joining strings with `/`. Symlinks may be unavailable, and file modes mean nothing there: private files need ACLs.
- **Paths from outside.** A path that arrived from the server or a repo is input. Reject `..` and absolute paths, `lstat` before writing, and don't follow symlinks out of the checkout.
- **Commands.** Run external tools with an argument array, never through a shell string. Take the runner as an argument so tests can replace it.
- **Repeats.** Install, remove and delete run twice must leave the same result as once.

## 10. Reference to copy

`packages/adapters/placement/fs` is the reference: a thin `adapter.ts` that maps the interface onto one file per operation, a single `failures/operation.ts` that turns unknown errors into `EnvdenError`, and a contract test that runs the suite once per mode.

For an adapter that wraps a command-line tool, read `packages/adapters/network/tailscale`. Its runner is an argument, so the contract test drives every scenario without Tailscale installed.

## 11. The Rust port

Mirror the TypeScript adapter in `rust/adapters/<kind>/<impl>`, crate `envden-adapter-<kind>-<impl>`:

- [ ] A new kind adds its trait `I<Kind>Adapter` to `rust/core/src/adapters`, and its contract suite and fake to `rust/testing`.
- [ ] `src/adapter.rs` exports `create_<impl>_<kind>_adapter`, returning the core trait. The traits are synchronous.
- [ ] `tests/contract.rs` runs the kind's contract suite from `envden-testing`.
- [ ] Wire it in `rust/cli/src/adapters.rs` or `rust/server/src/adapters.rs`, and add the crate to the root `Cargo.toml` members.
- [ ] Every TypeScript test case has a Rust equivalent with the same inputs and outcome.

## Before the PR

```sh
./node_modules/.bin/vp check --fix
bun test
./node_modules/.bin/fallow
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

The commit scope is the package name without `@envden/`, for example `feat(adapter-keychain-one-password): ...`.
