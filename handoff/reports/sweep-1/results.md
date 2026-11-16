# Sweep 1 results

## Fixes

| Finding | Root cause | Failing-first evidence | Commit |
|---|---|---|---|
| SIGTERM | CLI waited only for Ctrl-C | signal-red.log, signal-green.log; subprocess sends SIGTERM after listening | 2b0bb7ee |
| Unlock retry | Callback discarded retry bool | retry-red.log; workspace tests pass unlock_retry_label | f0017f97 |
| Trim | Rust Unicode whitespace differs from ECMAScript | trim-red.log, trim-green.log; full whitespace/directional trim table | beb8bc55 |
| Accept stderr | Explicit diagnostic absent from Bun | transport-red.log, transport-green.log; child test captures stderr | 68e052a7 |
| File size | Parser mixed token parsing/completion; storage mixed forwarding boilerplate/lifecycle | Existing parser/help/storage tests; clippy | 56adb817 |
| UI restore number | serde as_u64 rejects JSON floating representation of integer | restore-red.log; workspace restore_accepts_integer_json_numbers passes | a3e2c9aa |

The UI regression test was captured by concurrent commit 61a10c0 before the fix. Commit beb8bc55 also contains a concurrent sync/remote/upload.rs change due to a shared-index race. Later commits used a private temporary index. No history rewrite was attempted.

All own paths are committed. Pushed port/rust and verified origin/port/rust tracking. No PR created. TypeScript sources untouched by this agent. No target files deleted. Builds used target/sweep.

## Sweep scope

89 TS function/action comparisons are recorded in checklist.md. Full sweep incomplete. Unresolved gaps and unreviewed groups are explicitly marked there. Embedded dashboard assets are byte-identical to a fresh Bun build (ui-assets.log).

External trim call sites are listed in trim-handoff.md and were not edited.

## Validation

- fmt and clippy passed; final logs: fmt-final.log, clippy-final.log.
- release build passed: release.log. This binary predates the last concurrent sync/git fixes.
- full workspace tests passed after concurrent sync and git fixes: workspace-tests-final.log.
- full parity finished: 22/23 passed (parity.log). resolution-options differs in backup notice: TS uses .env; Rust uses absolute checkout path. The sync agent owns that path.
- e2e passed in both e2e-direct.log and completed release pipeline e2e.log.
