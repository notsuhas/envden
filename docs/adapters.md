# Writing an adapter

An adapter answers one question for envden: how devices reach the server, which repo a checkout belongs to, where keys live. Adapters are compiled into the binary and added by PR or fork (DESIGN § Decisions). Encryption, the sync protocol and merging are not adapters. Every adapter exists in the TypeScript reference on `main` and in Go, and both must pass the same contract cases.

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

## 2. New kind only: interface, contract suite, fake

Add these before any implementation, in one PR, and the same in the reference:

- [ ] The interface in `go/core/adapters/<kind>.go`.
- [ ] A contract suite, `<Kind>Contract(t, factory)`, in `go/testing/<kind>/contract.go`.
- [ ] A fake, `CreateFake<Kind>Adapter(Operations{...})`, beside it, with a test that every unsupplied operation panics.
- [ ] A row in the table in `docs/DESIGN.md` § Adapters.

Keep the interface small. Every method is something each future implementation must get right.

## 3. Read the interface

The interface in `go/core/adapters/<kind>.go` is the whole job. Read the contract suite in `go/testing/<kind>/contract.go` next: it states the behaviour the types can't, such as which calls are safe to repeat and which must fail.

## 4. Create the package

`go/adapters/<kind>/<impl>`, package `<impl>`, with:

- `adapter.go`, exporting `Create<Impl><Kind>Adapter`, which returns the core interface
- one file per operation or concern beside it
- `contract_test.go`, which runs the kind's contract suite and starts red

## 5. Make the contract test pass

- [ ] `contract_test.go` runs `<Kind>Contract` from `go/testing/<kind>`.
- [ ] The factory builds your adapter against what the suite hands it: a temp directory, a scenario name, or a fixture. Take the home folder, the data folder and any command runner as arguments, so the test never touches the user's real keys, their home or a real tailnet.
- [ ] If the suite is missing a case every implementation of the kind should pass, add it to the suite, and to the reference suite in the same change. Cases only your adapter has go in its own `_test.go` files.
- [ ] Time is an argument. No `time.Now()` in the adapter.

An adapter imports only `go/core`, plus `go/testing` in tests.

## 6. Fakes

Callers test against fakes, not your adapter. `CreateFake<Kind>Adapter` takes the operations a test needs and panics on every other call.

- [ ] If you added a method to the interface, add it to the fake.
- [ ] Don't write a second fake in an app's tests. Extend the shared one.

## 7. Wire it

Adapters are constructed in `go/cli/adapters.go`, or in the server's `Serve` for storage. Everything else receives adapters as arguments. When a caller injects adapters (tests do), a missing one becomes a stand-in that refuses, never the real network, keychain or service manager.

## 8. Report capabilities, don't branch on the adapter

Callers never ask which adapter they have. No `ID() == "tailscale"`, no type switches.

If callers need to act differently, put the difference on the interface and read it there. Existing examples: the placement mode and `Supported(dir)`, the keychain's `OwnerOnly()`, and the fields of the network status. `ID()` is for display and logs only.

A new capability is an interface change, so it also needs a contract case and a fake update.

## 9. Traps

- **Secrets in errors.** Return `*errors.Error` with a code and fixed message text, and put the underlying error in the cause. Never put env file contents, keys, tokens or passwords in a message, a log line or an error field. That includes command output you would otherwise echo. Use a length, count or hash.
- **Expected outcomes are not errors.** "Not found" and "not ready" are return values. Return an error only for failures.
- **Fail closed.** When a check can't be made, refuse. A network adapter that can't read its status reports not ready, and `Expose` fails. Placement refuses a path outside the checkout. A keychain that can't confirm a deletion fails.
- **Windows paths.** Build paths with `path/filepath`. Symlinks may be unavailable, and file modes mean nothing there: private files need ACLs. Platform code goes in `_windows.go` files, which only lint under `GOOS=windows`.
- **Paths from outside.** A path that arrived from the server or a repo is input. Reject `..` and absolute paths, `Lstat` before writing, and don't follow symlinks out of the checkout.
- **Commands.** Run external tools through `core/process` with an argument list, never through a shell string. Take the runner as an argument so tests can replace it.
- **Repeats.** Install, remove and delete run twice must leave the same result as once.

## 10. Reference to copy

`go/adapters/placement/fs` is the reference: a thin `adapter.go`, one file per concern, and a contract test that runs the suite once per mode.

For an adapter that wraps a command-line tool, read `go/adapters/network/tailscale`. Its runner is an argument, so the contract test drives every scenario without Tailscale installed.

## Before the PR

Run the checks in `AGENTS.md`. The commit scope is `go`, for example `feat(go): add the 1password keychain adapter`.
