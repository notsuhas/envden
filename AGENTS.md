# Working on envden (Go)

This branch holds the Go implementation only. The TypeScript reference, the parity harness and the site live on `main`.

## Where things are

- **Spec:** `docs/PROTOCOL.md` is the source of truth for anything cryptographic. `docs/DESIGN.md` covers product behaviour and, under Decisions, the choices made and the options rejected. Terms are in `docs/CONTEXT.md`. Releases are in `docs/releasing.md`. Go-specific notes and libraries are in `docs/ports/go.md`; differences from the reference are in `docs/ports/go-parity.md`.
- **Module:** `go/` is one module, `github.com/notsuhas/envden/go`. `core/` holds the protocol, chain, merge and adapter interfaces. Each adapter is its own package in `adapters/<kind>/<impl>`. Fakes and contract suites are in `testing/`. `cli/` and `server/` are the apps; `cmd/envden` is the one binary.
- **Parity:** `bash parity/local/run.sh` on `main` runs `main`'s harness against this binary; CI here runs only Go's own checks. Recorded fixtures from the reference are in each package's `testdata/`.

## Checks

```sh
cd go
export GOMODCACHE=$PWD/../.cache/gomod GOCACHE=$PWD/../.cache/gobuild GOBIN=$PWD/../.cache/bin GOFLAGS=-modcacherw
gofmt -l . && go vet ./... && golangci-lint run ./...
GOOS=darwin golangci-lint run ./... && GOOS=windows golangci-lint run ./...
go test ./...                          # TestExploration in cli/sync/enginetest takes ~25 min; -skip '^TestExploration$' while iterating
go build -o dist/envden ./cmd/envden
```

golangci-lint is v2.15.0 (`go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.15.0`). Turn on the pre-commit hook once per clone with `git config core.hooksPath .githooks`; it runs gofmt, `go vet` and golangci-lint on the staged packages.

Tests are `*_test.go` files in the package they test. Fixtures and vectors used only by tests go in that package's `testdata/`.

## Code style

- **No god files.** Each file does one thing: one codec, one helper, one command. Split any file that holds unrelated pieces or grows past roughly 200 lines.
- **Group related files in packages** named after the domain (`cli/admin/devices`, `cli/admin/move`). Don't encode the group in a filename. Once a package passes about 8 files, split it.
- **Let code breathe.** Blank line between top-level declarations, before a `return` that follows other statements, and between the logical steps inside a function.
- **Exports:** export only what other packages use.
- **Comments:** one line at most, and only for a non-obvious "why".
- **Decisions:** derive them in pure functions, each with a compact table test.
- **Discriminated returns:** a struct with a `Kind` string; leave the fields that don't apply at their zero value.
- **No deprecated APIs.**
- **Crypto:** never hand-roll primitives. Use the libraries pinned in `docs/ports/go.md`.

## Commits and reviews

- **Commits follow [Conventional Commits](https://www.conventionalcommits.org):** `type(scope): summary`, lowercase and imperative. Types are `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci` and `perf`. The scope is `go` for code in the module, or `ci`, `docs`, `packaging`. Mark breaking changes with `!`.
- **A behaviour change lands in every implementation**, never in Go alone. Record a deliberate difference in `docs/ports/go-parity.md`.
- **Review comments follow [Conventional Comments](https://conventionalcomments.org).**

## Packages and imports

- **Layers:** `core` imports no other package of the module. An adapter imports only `core`, plus `testing` in tests. `cli` and `server` import core and adapters.
- **Wiring:** adapters are wired in `cli/adapters.go` and in the server's `Serve`. Everything else receives adapters as arguments. Injected adapters never fall back to a real service, network or keychain.
- **Never branch on which adapter is in use.** Add a capability to the interface and read that.
- **Moves:** moving a file updates every importer. No forwarding shims.

## Adapters

- One package per implementation at `adapters/<kind>/<impl>`, exporting `Create<Impl><Kind>Adapter`, which returns the core interface.
- Every adapter has a `contract_test.go` running its kind's suite from `testing/<kind>`. A new kind adds its suite there first.
- Fakes live in `testing/`. A fake panics on any call the test didn't supply.
- Read `docs/adapters.md` before adding one.

## Errors

- **Expected outcomes are return values:** a struct with a `Kind`.
- **Failures return `*errors.Error`** from `core/errors` with a code from its list. The message is fixed text, and the underlying error goes in the cause. Never wrap one in `fmt.Errorf`; the CLI inspects the top error.
- **Never put env file contents, keys, tokens or passwords in a message, log line or error field.** Use a length, count or hash.
- **Translate once.** The CLI maps the code to an exit code in `cli/output`, and the server maps it to a status in one `onError`.

## Commands and routes

- A command or route does three things: parse input, call one function, report the result. Logic lives in that function, so a test can call it without a terminal or a socket.
- Anything on the wire has one decoder in `core/protocol` that rejects exactly what the reference schema rejects.
- `--json` output, state files and wire JSON match `JSON.stringify` byte for byte: ordered structs, no HTML escaping, JS number formatting.

## Tests

- **Test what can break:** codecs against vectors, crypto compositions, merge, storage commits, path validation, and whatever a bug fix changed. Skip what types guarantee.
- **Extend before you add.** Add a row to an existing table test when one fits.
- **One layer.** Test at the lowest layer that fails.
- **Bug fixes** start with a test that fails without the fix.
- **Time is an argument.** No `time.Now()` in logic; take `now func() int64`. Socket tests that check a timeout are the only tests that wait on the clock.
- **Tests never touch the real keychain, the user's home config, a real tailnet or a real launchd, systemd or schtasks service.** Use temp dirs and fakes.

## Suppressions

- Every `//nolint` says which linter and why.
- Don't add an exclusion to `.golangci.yml` to get past a check. Fix the code.

## Docs and work artifacts

- Docs hold decisions and constraints the code can't show. Don't list files, fields or control flow.
- When a decision changes, rewrite the affected text and its entry under `docs/DESIGN.md` § Decisions, saying what it replaced.
- Use the terms in `docs/CONTEXT.md` in identifiers, messages and docs.
- Don't commit plans, research notes or scratch files.
