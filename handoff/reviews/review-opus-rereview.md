# envden Go port re-review: opus-rereview

Reviewed commit `b2757bc` (port/go). The Go binary was built from that commit while the tree was still clean (`/tmp/opus-rereview/envden`). The TS reference is `apps/cli/dist/envden`. During the review, another session began editing this worktree (uncommitted: `go/lib/commander/parse.go`, `dispatch_test.go`, `go/cli/links/file_test.go`, `parity/*`). Those edits seem to target findings N1 and N3 below; I did not review them. Every binary run used temp HOME, ENVDEN_HOME, XDG_CONFIG_HOME and TMPDIR under `/tmp/opus-rereview/`. Scripts are in `/tmp/opus-rereview/scripts/`.

## Part 1: earlier findings at HEAD

| Finding | Status | Evidence |
|---|---|---|
| codex-a #1 / opus #2: Ed25519 cofactored check (high) | Fixed | `/tmp/codex-a/genesis.go` gives `Go chain valid`; `ed.go` gives `OK:true`; TS agrees. `sign.go` keeps noble's strict R/A decoding and small-order-A rejection, and adds the `ed25519consensus` check. It is the only verify call site. |
| codex-b #1: `--yes=false` confirms rm (high) | Fixed | `--yes=false`, `-y=false`, `--yes=true` and `-yfalse` all give TS-identical `unknown option` (exit 1), and the file is kept. The change caused regression N1. |
| codex-b #2: repo-ID IDNA (medium) | Fixed | `/tmp/codex-b/repro.*` now give identical IDs. Uses `nlnwa/whatwg-url`. A differential against Bun `URL` over 181 inputs (hosts, IDNA, IPv4 forms, IPv6, paths) found 2 harmless differences: `xn--.com` and `a.-1` (scheme://host), and `^` in a path. |
| codex-b #3: Unicode lowercasing (medium) | Fixed | sigma and dotted-I collisions and repo IDs match TS. Unicode 15 vs 17 table gaps are recorded in PARITY-NOTES. |
| codex-b #4: musl self-update (medium) | Fixed (by reading) | `platform.go` detects glibc via `getconf` or `ldd`; otherwise it picks musl. |
| opus #1: IPv6 hello (high) | Fixed for canonical addresses | The bracketed form now matches. Non-canonical hosts still fail; see N5. |
| opus #3: server connection timeouts (medium) | Fixed | `ReadHeaderTimeout` and `IdleTimeout` are 10 s. The dashboard server still has none; see N9. |
| opus #4: fractional `createdAt` lock (medium) | Fixed | Repro rerun: an old fractional owner gives exit 0 in both, pid 1.5 gives exit 3 in both, `1e5` gives exit 0 in both. |
| opus #5: join/pairing without the state lock (medium) | Fixed | Each site is wrapped in `WithStateLock`, in the same places and order as TS. |
| opus #6: scan `Choose` / RealHome (low-medium) | Fixed | |
| opus #7: placement message sanitizing (low-medium) | Fixed, with a regression | See N3. |
| opus #8: diff "Skipped checkout" line (low-medium) | Fixed | Same reporter as push/pull, on stdout, suppressed under `--json`. |
| opus #9: server address normalisation (low-medium) | Fixed | WHATWG lib. All six earlier rows now match TS. |

## Part 2: new findings, most severe first

### N1. Medium · correctness/parity (regression from the codex-b #1 fix): unknown options before a subcommand are silently dropped
- **Go:** go/lib/commander/parse.go:61-66 dispatches to `sub.Parse(args[i+1:])` while an unknown option is only remembered in `unknownOption`. :152-161 then prints help before the unknown-option check at :181.
- **TS:** commander `_parseCommand`. After an unknown option, every later argument goes to `unknown`, so no subcommand is found. With no operands it calls `checkForUnknownOptions()` before `help()`.
- **Ran:**

  | Command | TS | Go |
  |---|---|---|
  | `envden --bogus status` | exit 1, `error: unknown option '--bogus'` | runs `status` (`Not set up yet…`, exit 0) |
  | `envden device --bogus ls` | exit 1, unknown option | runs `device ls` |
  | `envden --bogus`, `envden -x`, `envden --version=1` | `unknown option …` | full help, exit 1 |

  Before `b2757bc`, Go errored like TS.
- **Why it matters:** a mistyped or unsupported flag placed before the subcommand is ignored and the command runs anyway. A script passing `--json` there gets text output instead of a failure.
- **Fix:** once an unknown option is seen, stop matching subcommands (treat later tokens as unknown, as commander does), and check unknown options before the "has subcommands, show help" branch.

### N2. Medium-low · parity (regression from the opus #18b fix): `history --restore abc` has the wrong message and exit code
- **Go:** go/cli/program/dailyuse/history.go:12 adds `opt.Parse`. go/lib/commander/parse.go:116-118 wraps every Parse error as `commander.invalidArgument`.
- **TS:** apps/cli/src/commands/sync/history.ts:17-20 uses `parseVersion`, which throws an EnvdenError. Commander only rewraps errors whose code is `commander.invalidArgument` (`port.ts` uses `InvalidArgumentError` for that). The EnvdenError reaches main.ts, which maps it to exit 2.
- **Ran:**
  - `history --restore abc .env` (also `--restore=abc` and `--restore=`). TS: `Version must be a number such as 3 or v3`, exit 2. Go: `error: option '--restore <version>' argument 'abc' is invalid. Version must be…`, exit 1.
  - Before the fix only the created directories differed; now stderr and the exit code differ too. Directories now match.
- **Fix:** let `Option.Parse` return an EnvdenError that propagates unwrapped. Wrap only a dedicated invalid-argument error type, so `serve --port` keeps the commander format.

### N3. Low-medium · parity (regression from the opus #7 fix): the "skipped" placement message uses `~` where TS prints the absolute path
- **Go:** go/cli/links/file.go:136 now prints `HomePath(destination)`.
- **TS:** apps/cli/src/links/file.ts:73 prints `sanitizeTerminal(destination)`. Only the "removed" message (:57) uses `homePath`. My earlier finding #7 was wrong to say both messages use it.
- **Also:** file.go:82 ("removed") uses `a.UserHome`, but TS uses `realHome(adapters.userHome)`, so a symlinked HOME prints `/private/…` instead of `~/…`.
- **Test:** the new go/cli/links/file_test.go asserts the wrong `~/repo…` text.
- **Fix:** keep sanitizing, drop `HomePath` on the skip line, use `RealHome` on the removed line, and correct the test.

### N4. Low-medium · parity (pre-existing; missed by all three earlier reviews): subcommand parse errors are sanitized in Go but raw in TS
- **Go:** go/lib/commander/command.go:108-117. `fail` walks up to the root's `OutputError`, which sanitizes.
- **TS:** apps/cli/src/program.ts:43 calls `configureOutput` on the root only. Subcommands are built with `new Command()` and `addCommand`, which doesn't inherit output settings, so their errors go out raw.
- **Ran:**
  - `rm --yesx .env`. TS: `error: unknown option '--yesx'` then `(Did you mean --yes?)` on a new line. Go puts both on one line.
  - `rm $'--x\e[31mred'`. TS echoes the raw ESC; Go strips it.
  - Every mistyped option on any subcommand gives different stderr.
- **Fix:** the TS behaviour is a TS bug (terminal escapes reach the terminal). Record it in PARITY-NOTES and fix both sides (configure output on every command), or match TS.

### N5. Low · correctness/parity: the opus #1 fix is incomplete; the client hello host is not WHATWG-canonical
- **Go:** go/cli/client/hello.go:29,88-92 uses `net/url` `Hostname()`.
- **TS:** apps/cli/src/client/hello.ts:45 uses `new URL(address).hostname`.
- **Ran:** Go `client.Hello` against a live TS server on 127.0.0.1:47391.
  - `http://127.0.0.1` and `http://LOCALHOST` succeed.
  - `http://127.1`, `http://2130706433` and `http://127.0.0.01` fail with `Server identity doesn't match…`.
  - The TS `hello` succeeds on all of them.
  - By the same reasoning, uncompressed IPv6 (`[fd7a:0:…:1]`) and IDN hosts also fail.
- **Reachable via:** `envden server switch <address>`, which passes the raw argument in both implementations. join, setup and move normalise first, so they're fine.
- **Fix:** take the host from `whatwg.Parse(address).Hostname()`, which is already a dependency.

### N6. Low · parity: the inode-identity fix formats numbers differently from JS
- **Go:** go/adapters/repo/git/checkout.go:201, `fmt.Sprintf("%.0f", float64(x))`.
- **TS:** packages/adapters/repo/git/src/checkout/checkout.ts:61, a template string, which uses JS shortest round-trip formatting.
- **Ran:**
  - 2^63: Go `9223372036854775808`, JS `9223372036854776000`.
  - 2^64-1: Go `…551616`, JS `…552000`.
  - 4 of 5 samples above 2^53 differ.
  - `strconv.FormatFloat(x, 'f', -1, 64)` matched all 5.
- **Impact:** above 2^53 the identity still differs, which was the case the fix targeted. The same applies to a negative darwin `dev` sign-extended to uint64. Switching binaries then asks for checkout approval again. Rare.

### N7. Low (latent) · storage parity: the empty-BLOB fix also turns SQL NULL into "present"
- **Go:** go/adapters/storage/sqlite/context.go:45-47 maps a nil scan to `[]byte{}`, and a NULL column also scans as nil.
- **TS:** packages/adapters/storage/sqlite/src/db/context.ts:11 keeps NULL as `undefined`.
- **Scenario:** `headers.files` is nullable.
  - If the latest header ever had NULL `files`, commits.go:37,66-76 would write `files = X''` instead of NULL.
  - History pruning (`hash NOT IN (SELECT files …)`) behaves differently with NULL and with X''.
  - Not reachable today, since every stored swap carries `filesHash` (apps/server/src/vault/material.ts:41).
- **Fix:** scan into `sql.RawBytes` or `*[]byte` and distinguish NULL from empty.

### N8. Low · parity (pre-existing): combined short root flags
`envden -Vx`: TS prints `0.3.8` and exits 0 (commander handles `-V` before the rest). Go now prints help and exits 1; before the fix it printed `unknown option '-Vx'`. Same family as N1.

### N9. Low · DoS parity: the dashboard server has no timeouts
- **Go:** go/cli/ui/start.go:57, a bare `http.Server{}`.
- **TS:** apps/cli/src/ui/start.ts:27, `Bun.serve` with the default 10 s `idleTimeout`.
- The lint-suppression comment says this "matches TS". It doesn't: a local process can hold connections open forever. Loopback only.

## Checked in Part 2, no finding
- **Server URL normalisation:** the WHATWG pathname feeds both the signature `PathAndQuery` check and routing, so they can't disagree. Percent-decoding of read/import path segments, mailbox `Number()` emulation (hex/bin/oct, trim, NaN, ±Inf, `""` = 0, first value), `query.Values` fallback decoding and the 100-continue and missing-Host handling all give the same authorization outcome as TS.
- **Trusted-process environment allow-list** with full-Unicode case mapping: no non-ASCII key can map onto an allowed name or `PATH`, the same as JS.
- **`textcase.Trim`:** exactly the ECMAScript WhiteSpace and LineTerminator set.
- **Clack input block:** Ctrl-C and lone Esc (500 ms) exit 0, as `@clack/core` 1.6 `block()` does. The `running` guard prevents a double-finish nil dereference. The stop/done handshake can't deadlock.
- **Lock owner** decode and validation match the zod schema (`z.int()`, optional string identity, null rejection).
- **Server identity, kit and error-kind JSON** are now decoded with exact keys.
- **Removing `ServerStaticPublicKey` from OPAQUE login:** the Argon2 cost is now paid once, and nothing read the field.
- **Others:** the in-place filter in `Reconcile` (works on a fresh slice), `NoFastForward` ordering, the zod-like strip in `DecodeOperation`, the dashboard HEAD and query changes.

## Tests
`go test -timeout 30m ./...` (isolated env) was run against the worktree while another session was editing it. Result: exit 0, all 124 packages with tests passed. `cli/sync/enginetest` took 1,588 s, so it needs a timeout above Go's 10-minute default. The parity harness was not run, because the other session had uncommitted edits in `parity/`.
