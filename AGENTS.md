# Working on envden

## Where things are

- **Spec:** `docs/PROTOCOL.md` is the source of truth for anything cryptographic. `docs/DESIGN.md` covers product behaviour and, under Decisions, the choices made and the options rejected. Terms are in `docs/CONTEXT.md`. Releases are in `docs/releasing.md`.
- **Packages:** `packages/core` holds the protocol, merge and adapter interfaces. Each adapter is its own package in `packages/adapters/<kind>/<impl>`. `apps/cli`, `apps/server` and `apps/web` are the apps.
- **Go port:** `go/` is a second implementation of core, adapters, CLI and server. TypeScript is the reference. See the Go port section below.
- **Packages are source-only** (`"exports": {".": "./src/index.ts"}`). Relative imports use the `.ts` extension.

## Checks

```sh
./node_modules/.bin/vp check --fix   # format (Oxfmt), lint (Oxlint), type check (tsgolint)
bun test
./node_modules/.bin/fallow           # unused code, cycles, duplication, complexity
```

Tests use `bun:test` and live in a `__tests__/` folder next to the code they test, for example `src/protocol/__tests__/encoding.test.ts` for `src/protocol/encoding.ts`. Never put a test file directly beside source files or at a folder's top level. Fixtures and vectors used only by tests go in that `__tests__/` folder too.

## Code style

- **No god files.** Each file does one thing: one codec, one helper, one command, one component, so each can be tested on its own. `index.ts` files only re-export; they contain no logic. Split any file that holds unrelated pieces or grows past roughly 200 lines.
- **Group related files in folders.** A folder's top level holds only its entry points. Everything else sits in folders named after the domain: `commands/device/{add,ls,rm}.ts`, `commands/server/{move,switch,repair}.ts`, `settings/`, `diagnostics/`. Don't encode the group in a filename (`device-add.ts`); make it a folder. Once a folder passes about 8 files, split it into subfolders.
- **Let code breathe.** Leave a blank line after the imports, between top-level declarations, between class members, before a `return` that follows other statements, and between the logical steps inside a function (setup, work, result). Keep tightly related lines together; separate everything else.
- **Naming:** interfaces are `I<Name>`, never with a `Props` suffix. Type aliases are `T<Name>`.
- **Exports:** export only what other files import.
- **Comments:** one line at most, and only for a non-obvious "why". No JSDoc essays and no legend comments on unions.
- **Branching:** no IIFEs. Use module-level pure functions.
- **Decisions:** derive them in pure functions, each with a compact test.
- **Discriminated returns:** make the falsy fields optional.
- **No deprecated APIs.**
- **Crypto:** never hand-roll primitives. Use the pinned libraries in `packages/core`.
- **React:** components take one `props` parameter and destructure it inside the body. Colours are `rgba()`, never hex.

## Commits and reviews

- **Commits follow [Conventional Commits](https://www.conventionalcommits.org):** `type(scope): summary`, with the summary in lowercase and the imperative mood. Types are `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci` and `perf`. The scope is the package: `core`, `cli`, `server`, `web`, `testing`, `tools`, or an adapter such as `adapter-storage-sqlite`. Use `adapters` for a change spanning several adapters. Mark breaking changes with `!`.
- **Changesets:** add one with `bunx changeset` for any change a user would notice, naming `@envden/cli`. Releases run `bun run release:version`.
- **Review comments follow [Conventional Comments](https://conventionalcomments.org):** `label (decorations): subject`, using labels such as `issue`, `suggestion`, `nitpick`, `question` and `praise`, and decorations such as `(blocking)` or `(non-blocking)`.

## Packages and imports

- **Import by name.** Another package is `@envden/<name>` or one of its subpath exports, never a relative path into another package's `src`.
- **Layers:** `core` imports no workspace package. An adapter imports only `@envden/core`, plus `@envden/testing` in tests. Apps import core and adapters. Lint and Fallow boundaries enforce this.
- **Wiring:** adapters are wired in one file per app, `apps/cli/src/adapters.ts` and `apps/server/src/adapters.ts`. Everything else receives adapters as arguments.
- **Never branch on which adapter is in use.** Add a capability to the interface and read that.
- **Moves:** moving a file deletes the old one and updates every importer. No re-export shims.

## Adapters

- One package per implementation at `packages/adapters/<kind>/<impl>`, named `@envden/adapter-<kind>-<impl>`.
- `src/adapter.ts` exports `create<Impl><Kind>Adapter`, which returns the core `I<Kind>Adapter`. `src/index.ts` re-exports it.
- Every adapter has `src/__tests__/contract.test.ts` running its kind's suite from `@envden/testing`. A new kind adds its suite there first.
- Fakes live in `@envden/testing`. A fake throws on any call the test didn't supply.
- Read `docs/adapters.md` before adding one.

## Errors

- **Expected outcomes are return values:** a discriminated union with a `kind`.
- **Failures throw `EnvdenError`** with a `code` from `TErrorCode`. The message is fixed text, and the underlying error goes in `cause`.
- **Never put env file contents, keys, tokens or passwords in a message, log line or error field.** Use a length, count or hash.
- **Translate once.** The CLI maps `code` to an exit code in `main.ts`, and the server maps it to a status in one `onError`.

## Commands and routes

- A CLI command or server route does three things: parse input, call one function, report the result. Logic lives in that function, so a test can call it without a terminal or a socket.
- Anything on the wire has one Zod schema in `packages/core/src/protocol`, built at module level, with its type inferred from it. Never declare a shape twice.

## Tests

- **Test what can break:** codecs against vectors, crypto compositions, merge, storage commits, path validation, and whatever a bug fix changed. Skip what types guarantee.
- **Extend before you add.** Add a row or assertion to an existing test when one fits.
- **One layer.** Test at the lowest layer that fails. Don't repeat a case per adapter or per command.
- **Bug fixes** start with a test that fails without the fix.
- **Time is an argument.** No `Date.now()`, sleeps, polling or per-test timeouts in logic or tests. A flaky test is fixed, not retried.
- **No `.only`.** A `.skip` needs an issue link on the line above.
- **Tests never touch the real keychain, the user's home config or a real tailnet.** Use temp dirs and fakes. A real-keychain test is opt-in through an env var.

## Suppressions

- Every `oxlint-disable`, `@ts-expect-error` and Fallow ignore says why.
- Don't add an ignore to `.fallowrc.json` or `vite.config.ts` to get past a check. Fix the code.

## Docs and work artifacts

- Docs hold decisions and constraints the code can't show. Don't list files, fields or control flow.
- When a decision changes, rewrite the affected text and its entry under `docs/DESIGN.md` § Decisions, saying what it replaced.
- Use the terms in `docs/CONTEXT.md` in identifiers, messages and docs.
- Don't commit plans, research notes or scratch files.

## Go port

- **Parity first.** Go must match TypeScript in stdout, stderr, exit codes, files and permissions, server database rows and wire bytes, bugs included (DESIGN § Decisions). A behaviour change lands in every implementation in the same PR. An improvement or TS bug found while porting goes in `PARITY-NOTES.md`; it is fixed in all implementations later, never in Go alone.
- **Where things are.** `docs/ports/go.md` maps Go packages to TS modules and lists the libraries; `docs/ports/go-cli-layout.md` maps every CLI file. `parity/` is the shared black-box runner.
- **Checks:**

  ```sh
  cd go
  gofmt -l . && go vet ./... && golangci-lint run ./...
  go test ./...
  cd .. && bun parity/run.ts --reference apps/cli/dist/envden --candidate go/dist/envden
  ```

- **Same rules, Go idiom.** The code style, error, test and adapter rules above apply. Tests are `*_test.go` files in the package they test, as Go requires, instead of a `__tests__/` folder. Errors are returned, not thrown: `errors.Wrap(code, message, cause)` from `go/core/errors`, with the TS message text. Times are `int64` milliseconds passed in, never `time.Now()` in logic.
- **No cycles.** Go forbids import cycles, so a CLI file goes where `docs/ports/go-cli-layout.md` puts it, even when its TS folder differs. `python3 scripts/ports/check-cli-layout.py --layers` checks the layering.
