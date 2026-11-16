# Sync/history parity fixes

All implementation commits below were pushed to port/rust. TypeScript source is unchanged.

| Finding | Root cause and regression | Commit |
| --- | --- | --- |
| Case collision | Missing NFC/case prefix gate; directory alias vectors and directory-spelling-collision parity | b3c8e12 |
| History lock | State read escaped the outer lock; history_holds_lock_through_network_reads | 73a1101a |
| Interactive unlock | Missing explicit callback and caller clock; supplied/gated callback regressions and locked-session parity | b3de1cfc, 1bb592bd |
| Detached chooser | Reconciliation discarded chooser and local-conflict result; detached_chooser and resolution-options parity | b2a8177a |
| Aligned conflicts | Existing records blocked before reading current bytes; aligned_conflicts and resolution-options parity | 0234d9cd |
| Repair markers | Recorded repair conflicts did not consume pending markers; repair_marker_is_consumed | 203079c9 |
| Removal bases | Shared bases and corrupt markers escaped cleanup; removal_cleans_shared_bases and file-options parity | 8d5e4646 |
| Join chooser | Initial sync omitted chooser dispatch; initial_reconciliation_offers_a_choice_for_a_differing_regular_copy and join-local-file-choice parity | 9d30e634, 61a10c0 |
| Backup notice | Placement reported an absolute path; placement_backup_notice_uses_the_checkout_relative_path | c2a77dc0 |
| Notice clock | Sync/client clocks could not capture command time; command_notice_freezes_remote_status_and_request_timestamps and mutable captured-clock regression | 5d194260 |

146 named TS functions compared in sync/local, sync/remote, history and remove; ordered source steps are in checklist.md.

Extra semantic gaps fixed, each with a failing-first regression:

- 04cd6631: placement journals each completed write and marks applied only after completion.
- 54a9b616: unpublished entries reconcile first; missing link content is held and failures stay per entry.
- e09fc8d2: history reads detached placed bytes and recognizes equal regular copies.
- 1131d940: history columns use terminal-cell width.
- 4f3bd019: attempt validation accepts the TS decimal range and exact header characters.
- bae9b113: attempt discovery preserves TS read-error and suffix semantics.
- 197d467a: upload checks detachment before reading bytes and reports globally held files.
- 237dc4a0: tombstone reconciliation retains copies without an uploaded base.
- a35b6d1c: missing placement targets hash as absent during interrupted operations.
- 04a15fec: chooser dispatch precedes corrupt/repair barriers.
- 133cb86b: cached author lookup propagates read failures.
- dc660f58: restored deletion targets reject unsafe symlinks.
- ef770287: held-back reporting follows TS evaluation order and propagates I/O failures.

Reference test expansion d146c13 covers all 6400 reachable copy-side combinations, retention/distinct-side invariants, target order, resolution and interrupted placement rows. Unix-only test gating: fa4e7ec6, bb75a6fc.

Parity scenarios and the collision complexity split: 8784c653. New scenarios passed TS-vs-TS twice before comparison with Rust. Fallow reports zero issues above threshold. accept.rs is 161 lines; reconciliation/file.rs is 206 lines with separate conflict and operation modules.

Validation uses committed snapshot d9835373d6f0da2d29d115d0f7f2e5c8a4c47e21, which includes every owned fix and the captured-clock follow-up. Concurrent uncommitted work was excluded.

- Formatting and workspace Clippy: passed.
- CLI tests: 266 library tests plus all binary, help, parser, approval, shutdown, surface and doc-test targets passed.
- Release build: passed; SHA-256 is in release-clock.sha256.
- Windows tests cross-check: passed using Zig; archived diagnostics/probe.rs has an unrelated unused_mut warning.
- E2E: passed in the foreground.
- Fallow: zero above threshold.
- Prior release parity: 24/24 passed.
- Captured-clock release's first full parity run: 23/24; join repository scanning returned Subprocess failed. A retained-fixture isolated diagnostic passed. No code or test was changed to mask this unexplained failure.
- Final full parity with retained fixtures: 24/24 passed, exit 0. The earlier unexplained Git subprocess failure is preserved in parity-clock.log; it is not claimed fixed.

Cleanup: removed /tmp/fix-sync2, the committed source archive and all 50 retained fixture directories; kept the release binary and verification artifacts. All 26 listed fix/test commits were verified as ancestors of origin/port/rust.
