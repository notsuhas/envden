# Vault sweep result

Compared 171 named functions and 153 anonymous callbacks/methods. DONE in checklist.md means comparison completed, not a blanket claim that the implementations are identical. Ordered source bodies record reads, effects and branches, including inline callbacks.

Fixed with failing-first regressions:
- edd17064: move abort acquires its own state lock and rejects empty saved pins as Missing move pin.
- 48876532: repair reads cached envelope before fetching repaired history.
- 745a2773: empty saved repair close is absent.
- fb60ccfb: empty saved move pin requires setup token.
- 909c48e5: checkpoint material decoding follows TS order.
- 4b46654d: kit parsing retains its failure source.
- 72e4f4a5: command notices clean old Windows binary before loading state.
- 646eb49: cached entries decode before cached headers, per object.
- d7c03b1: kit files decode invalid UTF-8 with replacement characters before parsing.
- 1bb592b plus regression 18495d1: notice deadline begins at invocation time; the sync owner's commit absorbed the production line before the test commit.
- b1e9f26: notice cache preserves fractional/negative timestamps and integer JSON spelling; this other agent's commit accidentally absorbed the change and test.
- b1e9f26 plus regression 61f759ff: repair context verifies only local entries; cached headers decode after first remote history.

Shared-index attribution: 909c48e5 also contains another agent's ui/view/status.rs edits despite this sweep's path-scoped commit command. 2ea3c6d absorbed the kit source regression before its implementation commit. History was preserved, never rewritten.

Other-fixer-owned onboarding findings, source-confirmed when compared:
- accept.rs omits joinLocalState vault conflict/creationPending handling and reloads state twice; TS validates existing state before opening keyring.
- vault/initial.rs lacks the outer state lock, computes fileId after reading content instead of before, and uses a Vec for bases where TS Map overwrites duplicate paths.
- join.rs swallows pending-kit read and removal errors; TS optionalRead/rm only suppress ENOENT. It also omits local verification of the recovery-signed add-device before POST swap.
- vault/create.rs does not implement setupVault's already-created early return, and decodes creationPending before checking whether epoch/id keys exist.

Remaining notice clock mismatch: command.rs uses adapters.now for remote status and request clocks where TS freezes the supplied command timestamp; the deadline half was fixed. ISyncOptions.now is a fn pointer in the sync owner's file, so a capturing command clock requires coordination with that owner. Left unchanged to respect shared ownership.

No newly discovered TS bug was changed or added to PARITY-NOTES.md. TS source was untouched.

Validation logs are in this directory. Windows cross-check passed with the /tmp/sweep-vault/zigcc and zigar wrappers; warnings remain in diagnostics/probe.rs and the server crate, outside this slice. The initial plain cross-check failed because MinGW was absent.

Workspace-complete hit an outside-slice parser surface newline mismatch for [device, list]: expected a newline before (Did you mean ls?). Retry is logged separately.

Final validation evidence:
- cargo fmt ran; clippy-complete.log is green.
- CLI unit suite in workspace-complete.log passes; the overall workspace run and its retry fail only in tests/surface.rs on the outside-slice device-list hint newline.
- release-complete.log is green.
- windows-zig-wrapper.log passes with warnings outside this slice.
- e2e-foreground.log: E2E passed.
- shared-parity.log: copied and verified the sibling adapter sweep's complete 24/24 passing log and exit status 0, using the same target/sweep/release/envden. Own fresh parity-complete.log passed through interrupted move before its duplicate process was stopped. Full shared proof is identified as shared, not claimed as an independently completed own run.
- All slice fixes were pushed; origin/port/rust tracking verified.
