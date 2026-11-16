# codex-rereview

Reviewed HEAD `b2757bc`, including `git diff 2e1c87c..HEAD -- go/`. Read-only review; no repository edits, commits, stash or reset. All envden executions used temporary HOME, ENVDEN_HOME, XDG_CONFIG_HOME and TMPDIR. Artifacts are under `/tmp/codex-rereview/`.

## Findings

### 1. Medium | security / availability / parity | Rejected requests with an unread body still have no timeout

Go: `go/server/main.go:116`, `go/server/app.go:64`.
TS: `apps/server/src/main.ts:65-72`.

Opus #3 is only partly fixed. The new ReadHeaderTimeout and IdleTimeout close partial headers and idle keep-alive connections, but neither applies while net/http drains an unread request body after the handler returns. An unauthenticated peer can declare a small body, send none of it, and retain a connection and goroutine indefinitely. The protocol's timed body reader is never reached on this rejection path.

Reproduced against both current binaries with this complete header block, followed by no body:

```text
POST /v1/vault HTTP/1.1\r\nHost: x\r\nContent-Length: 1\r\n\r\n
```

TS sent its error and closed at 12.00 seconds. Go had sent no response and remained open at the probe's 16-second cutoff. Source confirms there is no body read deadline on this path: net/http's response writer drains up to 256 KiB before sending the response. As a control, partial headers closed at 10.00 seconds in Go and 12.00 seconds in TS.

Evidence: `/tmp/codex-rereview/socket-probe.py`, `/tmp/codex-rereview/sockets.json`.

Fix direction: bound or avoid unread-body draining on early rejection, while preserving the longer, size-dependent deadlines for valid uploads. Add a socket-level test that sends complete headers and withholds the declared body. Checking only the http.Server timeout fields misses this case.

### 2. Medium | correctness / destructive-command parity | Unknown options disappear before subcommand dispatch

Go: `go/lib/commander/parse.go:63-65`, `go/lib/commander/parse.go:100-103`.
TS: `apps/cli/src/commands/sync/rm.ts:7-15`, through `apps/cli/node_modules/commander/lib/command.js:1602-1610`.

The boolean-option fix defers unknown-option errors, but recursive subcommand dispatch drops the parent's pending error. An invalid invocation can therefore execute a destructive action. This is a regression from 2e1c87c, where unknown options failed immediately.

Reproduced with a synthetic unpublished tracked `.env`:

```sh
envden --dry-run rm --yes .env
```

TypeScript exited 1 with `error: unknown option '--dry-run'` and preserved the file. Go exited 0, printed `Removed unpublished file locally`, and removed the checkout link and store file. Go retained its normal backup. Neither implementation supports --dry-run; the required behavior is rejection before executing anything.

The original `envden rm --yes=false .env` case now correctly exits 1 and preserves the file in both implementations.

Evidence: `/tmp/codex-rereview/cli-probes.py`, `/tmp/codex-rereview/cli-probes.json`. The fixture helper is `/tmp/codex-rereview/setup`, built from the earlier review's synthetic setup program.

Fix direction: carry unrecognized tokens into subcommand parsing, matching Commander, or reject the pending unknown option before dispatch. Cover unknown root and intermediate-command options with an assertion that no action/hook runs.

### 3. Low | parity / output | Placement path formatting still differs from TypeScript

Go: `go/cli/links/file.go:82,136`.
TS: `apps/cli/src/links/file.ts:57-58,73`.

Opus #7's terminal sanitization issue is fixed, but its path-formatting advice was inaccurate for the skip branch. TS prints the sanitized absolute destination when a differing local file is skipped. Go now abbreviates it with `~`. Conversely, the deleted-link branch needs realHome before abbreviation, as TS does; Go uses UserHome directly and still prints an absolute path when HOME is a symlink and the checkout root is resolved.

Ran the skip branch with synthetic local and stored contents. Go printed `envden: ~/repo/.env differs from the synced copy; skipped`; TS printed the absolute fixture path. Evidence: `/tmp/codex-rereview/messages.go`, `/tmp/codex-rereview/messages.ts`, and the outputs `messages-go.log` and `messages-ts.log`. The existing Go regression test also explicitly asserts the new abbreviated output, rather than the reference output.

Fix direction: use SanitizeTerminal(destination) for the skip branch, and SanitizeTerminal(HomePath(destination, RealHome(a.UserHome))) for deleted links. Retain the terminal-control-character test.

## Part 1: earlier high, medium and low-medium findings

| Earlier finding | Result at current HEAD | Verification |
| --- | --- | --- |
| codex-a #1, Ed25519 cofactored verification, high | Fixed | Reran the signed-genesis repro against current TS and Go; both return valid. Go retains canonical A/R and scalar checks and uses the cofactored verifier. Protocol/cofactor tests pass. |
| codex-b #1, --yes=false bypass, high | Original case fixed | Both binaries reject it with exit 1 and preserve the tracked file. New parser regression is finding 2 above. |
| codex-b #2, URL host normalization / Repo ID, medium | Fixed | Reran the original direct-call probe. Both return xn--bcher-kva.example/team/repo for the Unicode host. Repo adapter tests pass. |
| codex-b #3, Unicode lowercase / collisions, medium | Fixed for reported inputs | Original dotted-I and final-sigma collision and Repo ID probes match TS. Collision and textcase tests pass. Unicode table-version differences are explicitly documented in PARITY-NOTES.md. |
| codex-b #4, Linux updater always chooses glibc, medium | Fixed in production selection path | update now calls currentReleasePlatform, which detects libc. Injected musl, glibc and unavailable-command cases pass. No Alpine or actual self-update runtime was used. |
| opus #1, IPv6 hello binding, high | Fixed | Current TestIPv6Hello passes; client restores brackets before verification. |
| opus #2, Ed25519 verification, medium | Fixed | Same signed-genesis reproduction and crypto/cofactor tests as codex-a #1. |
| opus #3, connection timeouts, medium | Partly fixed; still open | Original partial-header scenario closes at 10 seconds. Complete headers with an unread body still hold a connection, finding 1 above. |
| opus #4, fractional TS lock owner, medium | Fixed | Both binaries reclaim a two-day-old owner with fractional createdAt, exit 0 and remove write.lock. Fractional-owner regression passes. |
| opus #5, join / pairing mutations without lock, medium | Fixed at all reported call sites | RefuseCommittedJoin, pairing reset, pair-pin write and both exchange-failure cleanup paths now use WithStateLock. Onboarding and pairing lock-contention regressions pass. |
| opus #6, checkout scan omits conflict choice / real home, low-medium | Fixed | SetupCheckouts supplies ChooseVersion and RealHome. Prompt tests exercise both choices and noninteractive skip. Full interactive join-to-scan flow was not replayed. |
| opus #7, unsafe placement messages, low-medium | Security part fixed; low parity residue | Both messages sanitize terminal text. Skip-message differential repro and deleted-link source comparison show finding 3 above. |
| opus #8, diff omits approval notice, low-medium | Fixed | TestDiffReportsUnapprovedCheckout passes for plain, --all and --json invocations. Reporter wiring matches the reference. |
| opus #9, server-address normalization, low-medium | Fixed for reported inputs | WHATWG parser replaces net/url in address validation and rehost comparison. Tests cover all six reported normalization cases and pass. |

No earlier high finding remains open. Neither remaining partial fix is documented as an accepted difference in PARITY-NOTES.md. Existing notes cover Unicode normalization/case table versions and runtime-owned HTTP framing; unread-body connection exhaustion is not a framing difference.

## Part 2: independent pass and validation

Inspected the changed production paths for crypto acceptance, URL and query normalization, server routing and body handling, lock interop and pairing cleanup, option parsing, updater selection, placement reporting, sync repair ordering and serialized operations, dashboard assets/routes, session windows, terminal input blocking, storage empty BLOB handling and recovery output. Also sampled unchanged host-installation, diagnostics, process and adapter paths against their TS counterparts. This was an independent adversarial pass, not a claim that every line in the port was reread.

Passed:

- Go build to `/tmp/codex-rereview/envden/envden`.
- All 196 Go packages outside cli/sync/enginetest completed successfully. Log: `/tmp/codex-rereview/all-except-engine.log`. The earlier targeted run also passed: `/tmp/codex-rereview/tests.log`.
- All 21 live Bun/Go HTTP comparisons. Log: `/tmp/codex-rereview/network.log`.
- Sync regressions TestDiffReportsUnapprovedCheckout, TestSyncConflict and TestSkippedFilesReportedBeforePlacement. Log: `/tmp/codex-rereview/engine.log`.
- Original signature, collision/Repo ID, boolean-consent and fractional-lock reproductions, plus the new destructive-option and socket probes.

The full slow sync-engine suite was not rerun. Windows behavior, real tailnet/keychain integration and an actual Linux-musl update remain runtime-unverified. No real user configuration or tailnet was used.

The worktree was initially clean. Other sessions later modified files under parity/; this review did not touch those changes or any repository file.
