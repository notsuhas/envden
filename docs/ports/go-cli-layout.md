# Go CLI package layout

The reference has 399 non-test TypeScript files, 1,552 local import edges and one five-file strongly connected component. Imports include type-only and dynamic imports. Browser assets are listed too. The source graph was inspected at file level; grouping the 20 domain folders hides acyclic paths as well as the real cycle.

## Layers, bottom-up

1. Existing core protocol, chain, adapters and library ports.
2. `version`, `time`, `jsonvalue`, `output` primitives, `state/model`, `state/files`, `network`.
3. `state/records`, `state/lock`, `state/journal`, `store`, pure settings; then `state/store`.
4. `identity`, then `client`, `client/routes`; then `contracts` (the adapter bundle), `session` and connected settings operations.
5. Domain leaves in the table below, followed by their orchestration packages. A caller may import its dependencies; an imported helper must never import its caller. Shared result types go in a model package.
6. `program` declares the tree; `cli/adapters.go` alone constructs concrete adapters; `cmd/envden/main.go` owns process termination.

## Breaking the back-edges

The actual file cycle is `sync/local/conflicts` → `output/render/sync/conflicts` → `sync/resolve` → `sync/local/reconciliation/placement/target` → `unsynced` → `sync/local/conflicts`. The two renderer imports are type-only. Move `IConflictRecord`, the conflict notice input, and the resolve result into `cli/model/conflicts`; rendering only consumes those types. Backup/storage operations stay below target placement.

Every `TAdapters` import becomes a `contracts.Adapters` argument. `cli.Adapters` aliases that type; only `cli/adapters.go` imports concrete adapters. `client.Options.Authenticated` and `LatestRelease` replace update-package imports. The default signed-minimum release lookup lives in the lower `release` package. Settings accepts a connected client rather than importing vault setup. Notice hooks, onboarding completion/rejoin, and UI actions receive callbacks from command composition rather than importing command orchestration.

Repository → journal → records uses separate `state/files`, `state/records`, `state/journal`, and `state/store` packages. No journal imports its repository. Service definitions, port selection and installation are lowered into `host`; adapter wiring no longer imports agent orchestration or updater orchestration. Domain models must not import clients, orchestration or output rendering.

## Work packages

| Work | TS scope | Non-test lines | Depends on |
|---|---|---:|---|
| F: foundation (this task) | adapters, client, identity, network, session, settings, state, store, time, version, output basics, command declarations | about 3,000 | existing Go ports |
| W1: sync | all sync files and sync result models | 3,667 | F; leaf link approval API from W4 |
| W2: access | vault, pairing, onboarding | 3,530 | F; checkout discovery API from W4; rejoin callback from composition |
| W3: administration and history | admin, history | 2,949 | F, W2 connection/material API |
| W4: workspace and dashboard | links, ui | 2,807 | F; injected W1/W3 UI actions |
| W5: integration and presentation | agent, notice, status, updates, report, diagnostics, remaining output, command actions | about 3,000 | F, W1–W4 at final wiring |

Agents can implement the domain leaves in parallel against agreed interfaces. W1 receives approved-checkout lookup, W2 receives checkout scanning and rejoin callbacks, W4 receives dashboard actions. W5 performs final composition; declarations already exist as stubs. The five groups are ownership boundaries, not five Go packages.

## State and runtime ownership

`contracts.Adapters` carries clocks, network, keychain, repo, placement/shell factories and service hooks. `lock.WithStateLock(ctx, home, timing, fn)` propagates reentrancy through `context.Context`; callers must forward the supplied context into nested state operations. The filesystem owner-root set is synchronized inside `state/files`. Trusted execution roots remain in `core/process`, initialized once per command from approved state at the program pre-action boundary.

`process.exitCode` becomes the return/error from a command, mapped once by the main entry point. Writers are injected on the cobra commands and output sinks; Go does not replace global console functions. `model.State.Order` preserves loaded JSON field insertion order. Call `State.Touch("field")` when assigning new optional fields to append them to that order, so saves preserve TS mutation order. `VerifiedState` retains the TS tagged JSON representation as raw JSON until a domain needs to inspect it.

The checked package DAG can be reproduced with `python3 scripts/ports/check-cli-layout.py --layers`. Browser assets are excluded from Go imports.

## Foundation APIs

- `cli.CreateAdapters(options, now) (contracts.Adapters, error)`; domains import `contracts`, never `cli`.
- `model.EmptyState(name)`, `State.Record()`, `store.LoadState(home)`, `store.SaveState(ctx, home, state, timing)`.
- `files.AtomicWrite(path, bytes, now)`, `OptionalRead`, `PrivateDirectory`, `RealLocation`; `records.ReadSyncRecord`, `RecoverSyncRecord`, `InvalidSyncRecord`.
- `lock.WithStateLock`, `Timing{Now, Wait, Delays}`, `ReadOwner`, `Reclaimable`, `ReclaimLock`.
- `identity.DeviceIdentity(ctx, keychain, home, name, fresh, timing)`, `ReadIdentity`, `IdentityBytes`, `AdoptCommittedName`.
- `client.CreateClient(Options{HelloCache: adapters.HelloCache, ...})`, `Client.Request(ctx, path, method, body)`, `ForVault`, `Hello`, `Text`, `Binary`, `DecodeUntrusted`, `RetryBusy`, `RetryHead`. Pass raw bytes or an ordered struct/`jsonvalue.Object`; maps sort keys and cannot preserve TS request order.
- `session.Login`, `RegisterPassword`, `UnlockDevice`, `RecordUnlockWindow`; `settings.ParseConfig`, `ReadConfig`, `SetConfig`, `SettingRequest`, `UnlockPeriod`.
- `client/routes.Do(ctx, client, route, body)` decodes the core response schema; `routes.Bytes` handles raw binary responses. Named descriptors cover auth, pairing, settings, devices, history ranges, swaps, blob/material uploads, move and repair. `routes.Range` and `routes.Object` build resource paths.
- `output.SanitizeTerminal`, `SanitizeConsole`, `TerminalJSON`, `ErrorExitCode`, `ReportError`; `program.CreateProgram`.

## Validation and remaining integration

`go test ./cli/...` includes exact TS state/config fixtures, authenticated history fixtures, signed HTTP/retry cases, OPAQUE sessions and private persistence. Help is compared by its command and option sets in the parity suite. `go vet ./cli/... ./cmd/envden` checks the foundation.

Command actions intentionally return `NOT_IMPLEMENTED`. W5 still owns notice/update/telemetry/report lifecycle integration. Pass `Adapters.HelloCache` as `client.Options.HelloCache` to share TS’s per-fetch hello cache across clients. `ForVault` retains the cache. Allocate a separate cache when changing fetchers. Raw filesystem errno messages use Go wording (see [go-parity.md](go-parity.md)). Native Windows lock calls compile by platform but have not been run on Windows.

## Every source file

Paths below are relative to `apps/cli/src` and `go` respectively. A package is the target file’s parent. Commands map their declarations into `program`; their action implementations remain in the named TS domain work package. Browser TS/CSS/HTML are embedded browser assets, not executable Go packages. Files over 200 lines must split along their existing helper boundaries during implementation.

| TypeScript source | Go target |
|---|---|
| `adapters.ts` | `cli/adapters.go` |
| `admin/devices/exposed-file.ts` | `cli/admin/devices/exposed_file.go` |
| `admin/devices/exposure.ts` | `cli/admin/devices/exposure.go` |
| `admin/devices/list.ts` | `cli/admin/devices/list.go` |
| `admin/devices/recovery-holders.ts` | `cli/admin/devices/recovery_holders.go` |
| `admin/devices/remove.ts` | `cli/admin/devices/remove.go` |
| `admin/devices/rename.ts` | `cli/admin/devices/rename.go` |
| `admin/devices/revocation.ts` | `cli/admin/devices/revocation.go` |
| `admin/devices/rotate.ts` | `cli/admin/devices/rotate.go` |
| `admin/move/abort.ts` | `cli/admin/move/abort.go` |
| `admin/move/credentials.ts` | `cli/admin/move/credentials.go` |
| `admin/move/follow.ts` | `cli/admin/move/follow.go` |
| `admin/move/resume.ts` | `cli/admin/move/resume.go` |
| `admin/move/run.ts` | `cli/admin/move/run.go` |
| `admin/move/switch.ts` | `cli/admin/move/switch.go` |
| `admin/recovery/credentials.ts` | `cli/admin/recovery/credentials.go` |
| `admin/recovery/envelope.ts` | `cli/admin/recovery/envelope.go` |
| `admin/recovery/pending.ts` | `cli/admin/recovery/pending.go` |
| `admin/recovery/reset.ts` | `cli/admin/recovery/reset.go` |
| `admin/rejoin/classify.ts` | `cli/admin/rejoin/classify/classify.go` |
| `admin/rejoin/kit.ts` | `cli/admin/rejoin/kit.go` |
| `admin/rejoin/run.ts` | `cli/admin/rejoin/run.go` |
| `admin/repair/chain.ts` | `cli/admin/repair/chain.go` |
| `admin/repair/completion/blobs.ts` | `cli/admin/repair/completion/blobs.go` |
| `admin/repair/completion/close.ts` | `cli/admin/repair/completion/close.go` |
| `admin/repair/completion/files.ts` | `cli/admin/repair/completion/files.go` |
| `admin/repair/completion/gaps.ts` | `cli/admin/repair/completion/gaps.go` |
| `admin/repair/completion/names.ts` | `cli/admin/repair/completion/names.go` |
| `admin/repair/completion/reports.ts` | `cli/admin/repair/completion/reports.go` |
| `admin/repair/drop.ts` | `cli/admin/repair/drop.go` |
| `admin/repair/finish.ts` | `cli/admin/repair/finish/finish.go` |
| `admin/repair/login.ts` | `cli/admin/repair/login.go` |
| `admin/repair/lost.ts` | `cli/admin/repair/lost.go` |
| `admin/repair/resume.ts` | `cli/admin/repair/resume.go` |
| `admin/repair/upload.ts` | `cli/admin/repair/upload.go` |
| `admin/shared/commit.ts` | `cli/admin/shared/commit.go` |
| `admin/shared/context.ts` | `cli/admin/shared/context.go` |
| `admin/shared/epoch.ts` | `cli/admin/shared/epoch.go` |
| `admin/shared/history.ts` | `cli/admin/shared/history.go` |
| `admin/shared/material.ts` | `cli/admin/shared/material.go` |
| `admin/shared/submission.ts` | `cli/admin/shared/submission.go` |
| `admin/shared/swap.ts` | `cli/admin/shared/swap.go` |
| `admin/shared/transfer.ts` | `cli/admin/shared/transfer.go` |
| `agent/install.ts` | `cli/agent/install.go` |
| `agent/service/generate.ts` | `cli/host/definition.go` |
| `agent/service/install.ts` | `cli/host/install.go` |
| `agent/service/installed.ts` | `cli/agent/service/installed.go` |
| `agent/service/location.ts` | `cli/host/install.go` |
| `agent/service/port.ts` | `cli/host/port.go` |
| `agent/shell.ts` | `cli/agent/shell.go` |
| `agent/write-through.ts` | `cli/host/install.go` |
| `client/encoding.ts` | `cli/client/encoding.go` |
| `client/errors.ts` | `cli/client/errors.go` |
| `client/fetch.ts` | `cli/client/fetch.go` |
| `client/hello.ts` | `cli/client/hello.go` |
| `client/history.ts` | `cli/client/history.go` |
| `client/request.ts` | `cli/client/request.go` |
| `client/retry.ts` | `cli/client/retry.go` |
| `client/untrusted.ts` | `cli/client/encoding.go` |
| `commands/agent/agent.ts` | `cli/program/maintenance/agent.go` |
| `commands/agent/install.ts` | `cli/program/maintenance/install.go` |
| `commands/checkouts/local-only.ts` | `cli/program/files/local_only.go` |
| `commands/checkouts/track.ts` | `cli/program/files/track.go` |
| `commands/checkouts/untrack.ts` | `cli/program/files/untrack.go` |
| `commands/device/add.ts` | `cli/program/devicesandvault/add.go` |
| `commands/device/device.ts` | `cli/program/devicesandvault/device.go` |
| `commands/device/ls.ts` | `cli/program/devicesandvault/ls.go` |
| `commands/device/rename.ts` | `cli/program/devicesandvault/rename.go` |
| `commands/device/rm.ts` | `cli/program/devicesandvault/rm.go` |
| `commands/maintenance/config.ts` | `cli/program/maintenance/config.go` |
| `commands/maintenance/doctor.ts` | `cli/program/maintenance/doctor.go` |
| `commands/maintenance/update.ts` | `cli/program/maintenance/update.go` |
| `commands/maintenance/version.ts` | `cli/program/maintenance/version.go` |
| `commands/onboarding/join.ts` | `cli/program/getstarted/join.go` |
| `commands/onboarding/missing-setup-flags.ts` | `cli/program/getstarted/missing_setup_flags.go` |
| `commands/onboarding/options.ts` | `cli/program/getstarted/setup.go + join.go` |
| `commands/onboarding/setup.ts` | `cli/program/getstarted/setup.go` |
| `commands/onboarding/unlock.ts` | `cli/program/getstarted/unlock.go` |
| `commands/server/move.ts` | `cli/program/devicesandvault/move.go` |
| `commands/server/port.ts` | `cli/program/maintenance/serve.go` |
| `commands/server/repair.ts` | `cli/program/devicesandvault/repair.go` |
| `commands/server/serve.ts` | `cli/program/maintenance/serve.go` |
| `commands/server/server.ts` | `cli/program/devicesandvault/server.go` |
| `commands/server/switch.ts` | `cli/program/devicesandvault/switch.go` |
| `commands/shell/shell.ts` | `cli/program/maintenance/shell.go` |
| `commands/sync/alias.ts` | `cli/program/dailyuse/alias.go` |
| `commands/sync/diff.ts` | `cli/program/dailyuse/diff.go` |
| `commands/sync/history.ts` | `cli/program/dailyuse/history.go` |
| `commands/sync/pull.ts` | `cli/program/dailyuse/pull.go` |
| `commands/sync/push.ts` | `cli/program/dailyuse/push.go` |
| `commands/sync/resolve.ts` | `cli/program/dailyuse/resolve.go` |
| `commands/sync/rm.ts` | `cli/program/dailyuse/rm.go` |
| `commands/sync/status.ts` | `cli/program/dailyuse/status.go` |
| `commands/ui/ui.ts` | `cli/program/maintenance/ui.go` |
| `commands/vault/output.ts` | `cli/program/devicesandvault/vault.go` |
| `commands/vault/run.ts` | `cli/program/devicesandvault/vault.go` |
| `commands/vault/vault.ts` | `cli/program/devicesandvault/vault.go` |
| `diagnostics/doctor.ts` | `cli/diagnostics/doctor.go` |
| `history/files/current.ts` | `cli/history/files/current.go` |
| `history/files/select.ts` | `cli/history/files/select.go` |
| `history/list/changes.ts` | `cli/history/list/changes.go` |
| `history/list/render.ts` | `cli/history/list/render.go` |
| `history/list/run.ts` | `cli/history/list/run.go` |
| `history/restore/gate.ts` | `cli/history/restore/gate.go` |
| `history/restore/refusal.ts` | `cli/history/restore/refusal.go` |
| `history/restore/render.ts` | `cli/history/restore/render.go` |
| `history/restore/run.ts` | `cli/history/restore/run.go` |
| `history/restore/version.ts` | `cli/history/restore/version.go` |
| `history/versions/match.ts` | `cli/history/versions/match.go` |
| `history/versions/retained.ts` | `cli/history/versions/retained.go` |
| `history/versions/source.ts` | `cli/history/versions/source.go` |
| `history/versions/walk.ts` | `cli/history/versions/walk.go` |
| `identity/device.ts` | `cli/identity/device.go` |
| `identity/name/fit.ts` | `cli/identity/name/fit.go` |
| `identity/name/suggested.ts` | `cli/identity/name/suggested.go` |
| `identity/name/unique.ts` | `cli/identity/name/unique.go` |
| `identity/rename.ts` | `cli/identity/rename.go` |
| `identity/stored.ts` | `cli/identity/stored.go` |
| `links/alias.ts` | `cli/links/alias.go` |
| `links/approval.ts` | `cli/links/approval.go` |
| `links/checkout/bases.ts` | `cli/links/checkout/bases.go` |
| `links/checkout/mode.ts` | `cli/links/checkout/mode.go` |
| `links/checkout/repo.ts` | `cli/links/checkout/repo.go` |
| `links/checkout/supported.ts` | `cli/links/checkout/supported.go` |
| `links/checkout/untrack.ts` | `cli/links/checkout/untrack.go` |
| `links/checkout/worktree.ts` | `cli/links/checkout/worktree.go` |
| `links/discovery/folders.ts` | `cli/links/discovery/folders.go` |
| `links/discovery/identify.ts` | `cli/links/discovery/identify.go` |
| `links/discovery/repos.ts` | `cli/links/discovery/repos.go` |
| `links/file.ts` | `cli/links/file.go` |
| `links/fork.ts` | `cli/links/fork.go` |
| `links/local-only.ts` | `cli/links/local_only.go` |
| `links/place.ts` | `cli/links/place/place.go` |
| `links/prune.ts` | `cli/links/place/prune.go` |
| `links/takeover/adopt.ts` | `cli/links/takeover/adopt.go` |
| `links/takeover/group.ts` | `cli/links/takeover/group.go` |
| `links/takeover/offer.ts` | `cli/links/takeover/offer.go` |
| `links/takeover/sibling.ts` | `cli/links/takeover/sibling.go` |
| `links/takeover/target.ts` | `cli/links/takeover/target/target.go` |
| `main.ts` | `cmd/envden/main.go` |
| `network/unsupplied.ts` | `cli/network/unsupplied.go` |
| `notice/cache.ts` | `cli/notice/cache.go` |
| `notice/command.ts` | `cli/notice/command.go` |
| `notice/fetch.ts` | `cli/notice/fetch/fetch.go` |
| `notice/offers.ts` | `cli/notice/offers.go` |
| `notice/pending.ts` | `cli/notice/pending.go` |
| `notice/recovery.ts` | `cli/notice/recovery.go` |
| `notice/remote.ts` | `cli/notice/remote.go` |
| `onboarding/add.ts` | `cli/onboarding/add.go` |
| `onboarding/checkouts/choose.ts` | `cli/onboarding/checkouts/choose.go` |
| `onboarding/checkouts/eligible.ts` | `cli/onboarding/checkouts/eligible.go` |
| `onboarding/checkouts/find.ts` | `cli/onboarding/checkouts/find.go` |
| `onboarding/checkouts/report.ts` | `cli/onboarding/checkouts/report.go` |
| `onboarding/checkouts/rescan.ts` | `cli/onboarding/checkouts/rescan.go` |
| `onboarding/complete-join.ts` | `cli/onboarding/complete_join.go` |
| `onboarding/decisions.ts` | `cli/onboarding/decisions/decisions.go` |
| `onboarding/host/local.ts` | `cli/onboarding/host/local.go` |
| `onboarding/host/rehost.ts` | `cli/onboarding/host/rehost.go` |
| `onboarding/join/pairing.ts` | `cli/onboarding/join/pairing.go` |
| `onboarding/join/recovery.ts` | `cli/onboarding/join/recovery.go` |
| `onboarding/join.ts` | `cli/onboarding/join.go` |
| `onboarding/password.ts` | `cli/onboarding/password.go` |
| `onboarding/preferences.ts` | `cli/onboarding/preferences.go` |
| `onboarding/scan.ts` | `cli/onboarding/scan.go` |
| `onboarding/setup.ts` | `cli/onboarding/setup.go` |
| `output/counts.ts` | `cli/output/counts.go` |
| `output/errors.ts` | `cli/output/errors.go` |
| `output/exit-code.ts` | `cli/output/errors.go` |
| `output/home-path.ts` | `cli/output/home_path.go` |
| `output/progress/scan.ts` | `cli/output/progress/scan.go` |
| `output/prompts/device-name.ts` | `cli/output/prompts/device_name.go` |
| `output/prompts/questions.ts` | `cli/output/prompts/questions.go` |
| `output/prompts/token.ts` | `cli/output/prompts/token.go` |
| `output/quiet-commands.ts` | `cli/output/quiet_commands.go` |
| `output/render/devices/device-list.ts` | `cli/output/render/devices/device_list.go` |
| `output/render/devices/devices.ts` | `cli/output/render/devices/devices.go` |
| `output/render/devices/kit.ts` | `cli/output/render/devices/kit.go` |
| `output/render/devices/summary.ts` | `cli/output/render/devices/summary.go` |
| `output/render/doctor.ts` | `cli/output/render/doctor.go` |
| `output/render/repair.ts` | `cli/output/render/repair.go` |
| `output/render/scan/details.ts` | `cli/output/render/scan/details.go` |
| `output/render/scan/summary.ts` | `cli/output/render/scan/summary.go` |
| `output/render/settings.ts` | `cli/output/render/settings.go` |
| `output/render/sync/conflicts.ts` | `cli/output/render/sync/conflicts.go` |
| `output/render/sync/diff.ts` | `cli/output/render/sync/diff/diff.go` |
| `output/render/sync/status.ts` | `cli/output/render/sync/diff/status.go` |
| `output/render/sync/sync.ts` | `cli/output/render/sync/sync.go` |
| `output/sanitize.ts` | `cli/output/sanitize.go + json.go` |
| `output/telemetry/background.ts` | `cli/output/telemetry/background.go` |
| `output/telemetry/report.ts` | `cli/output/telemetry/report.go` |
| `pairing/approver.ts` | `cli/pairing/approver.go` |
| `pairing/exchange.ts` | `cli/pairing/exchange.go` |
| `pairing/finish.ts` | `cli/pairing/finish.go` |
| `pairing/guard.ts` | `cli/pairing/guard.go` |
| `pairing/joiner.ts` | `cli/pairing/joiner.go` |
| `pairing/local.ts` | `cli/pairing/local.go` |
| `pairing/persistence/cleanup.ts` | `cli/pairing/persistence/cleanup.go` |
| `pairing/persistence/stale.ts` | `cli/pairing/persistence/stale.go` |
| `pairing/persistence/submission.ts` | `cli/pairing/persistence/submission.go` |
| `pairing/prompt.ts` | `cli/pairing/prompt.go` |
| `pairing/wait.ts` | `cli/pairing/wait.go` |
| `program.ts` | `cli/program/program.go` |
| `report/content/arguments.ts` | `cli/report/content/arguments.go` |
| `report/content/document.ts` | `cli/report/content/document.go` |
| `report/content/failure.ts` | `cli/report/content/failure.go` |
| `report/content/issue.ts` | `cli/report/content/issue.go` |
| `report/content/prompt.ts` | `cli/report/content/prompt.go` |
| `report/content/redact.ts` | `cli/report/content/redact.go` |
| `report/facts.ts` | `cli/report/facts.go` |
| `report/harness.ts` | `cli/report/harness.go` |
| `report/launch.ts` | `cli/report/launch.go` |
| `report/offer.ts` | `cli/report/offer.go` |
| `report/run.ts` | `cli/report/run.go` |
| `report/write.ts` | `cli/report/write.go` |
| `session/login.ts` | `cli/session/login.go` |
| `session/registration.ts` | `cli/session/registration.go` |
| `session/unlock.ts` | `cli/session/unlock.go` |
| `session/window.ts` | `cli/session/window.go` |
| `settings/build-config.ts` | `cli/settings/privacy.go` |
| `settings/config.ts` | `cli/settings/config.go` |
| `settings/paths.ts` | `cli/settings/paths.go` |
| `settings/placement.ts` | `cli/settings/connected.go` |
| `settings/privacy.ts` | `cli/settings/privacy.go` |
| `settings/request.ts` | `cli/settings/request.go` |
| `settings/unlock-period.ts` | `cli/settings/request.go + connected.go` |
| `state/cancelled.ts` | `cli/state/configured.go` |
| `state/configured.ts` | `cli/state/configured.go` |
| `state/journal/placement.ts` | `cli/state/journal/placement.go` |
| `state/lock/acquire.ts` | `cli/state/lock/acquire.go` |
| `state/lock/identity.ts` | `cli/state/lock/owner.go` |
| `state/lock/lock.ts` | `cli/state/lock/lock.go` |
| `state/lock/owner.ts` | `cli/state/lock/owner.go` |
| `state/lock/process.ts` | `cli/state/lock/process.go` |
| `state/lock/publish.ts` | `cli/state/lock/owner.go` |
| `state/lock/reclaim.ts` | `cli/state/lock/acquire.go` |
| `state/lock/windows.ts` | `cli/state/lock/process_windows.go` |
| `state/model.ts` | `cli/state/model/model.go` |
| `state/store/files.ts` | `cli/state/files/files.go` |
| `state/store/headers.ts` | `cli/state/store/headers.go` |
| `state/store/real-location.ts` | `cli/state/files/location.go` |
| `state/store/records.ts` | `cli/state/records/records.go` |
| `state/store/repository.ts` | `cli/state/store/repository.go` |
| `status/file-state.ts` | `cli/status/file_state.go` |
| `status/local.ts` | `cli/status/local.go` |
| `status/reachability.ts` | `cli/status/reachability.go` |
| `status/remote.ts` | `cli/status/remote.go` |
| `status/report.ts` | `cli/status/report.go` |
| `store/path.ts` | `cli/store/path.go` |
| `sync/README.md` | `documentation only (no Go code)` |
| `sync/alias.ts` | `cli/sync/alias.go` |
| `sync/command.ts` | `cli/sync/command.go` |
| `sync/diff.ts` | `cli/sync/diff.go` |
| `sync/engine.ts` | `cli/sync/engine.go` |
| `sync/first-run.ts` | `cli/sync/first_run.go` |
| `sync/local/applied.ts` | `cli/sync/local/applied.go` |
| `sync/local/conflicts/author.ts` | `cli/sync/local/conflicts/author.go` |
| `sync/local/conflicts/schema.ts` | `cli/sync/local/conflicts/schema.go` |
| `sync/local/conflicts.ts` | `cli/sync/local/conflicts.go` |
| `sync/local/files.ts` | `cli/sync/local/files/files.go` |
| `sync/local/lineage/held-back.ts` | `cli/sync/local/lineage/held_back.go` |
| `sync/local/lineage/reasons.ts` | `cli/sync/local/lineage/reasons.go` |
| `sync/local/lineage/versions.ts` | `cli/sync/local/lineage/versions.go` |
| `sync/local/receiving.ts` | `cli/sync/local/receiving.go` |
| `sync/local/reconcile.ts` | `cli/sync/local/reconcile/reconcile.go` |
| `sync/local/reconciliation/content/sides.ts` | `cli/sync/local/reconciliation/content/sides.go` |
| `sync/local/reconciliation/decision.ts` | `cli/sync/local/reconciliation/decision.go` |
| `sync/local/reconciliation/file-decision.ts` | `cli/sync/local/reconciliation/file_decision.go` |
| `sync/local/reconciliation/file.ts` | `cli/sync/local/reconciliation/file.go` |
| `sync/local/reconciliation/history.ts` | `cli/sync/local/reconciliation/history/history.go` |
| `sync/local/reconciliation/operation/conflict.ts` | `cli/sync/local/reconciliation/operation/conflict.go` |
| `sync/local/reconciliation/operation/deletion.ts` | `cli/sync/local/reconciliation/operation/deletion.go` |
| `sync/local/reconciliation/operation/file.ts` | `cli/sync/local/reconciliation/operation/file.go` |
| `sync/local/reconciliation/operation/guards.ts` | `cli/sync/local/reconciliation/operation/guards.go` |
| `sync/local/reconciliation/operation/record.ts` | `cli/sync/local/reconciliation/operation/record.go` |
| `sync/local/reconciliation/operation/state.ts` | `cli/sync/local/reconciliation/operation/state.go` |
| `sync/local/reconciliation/placement/display.ts` | `cli/sync/local/reconciliation/placement/display.go` |
| `sync/local/reconciliation/placement/skip.ts` | `cli/sync/local/reconciliation/placement/skip.go` |
| `sync/local/reconciliation/placement/target.ts` | `cli/sync/local/reconciliation/placement/target/target.go` |
| `sync/local/reconciliation/placement/unsynced.ts` | `cli/sync/local/reconciliation/placement/target/unsynced.go` |
| `sync/local/reconciliation/resolution.ts` | `cli/sync/local/reconciliation/resolution.go` |
| `sync/local/reconciliation/snapshot.ts` | `cli/sync/local/reconciliation/history/snapshot.go` |
| `sync/local/reconciliation/targets.ts` | `cli/sync/local/reconciliation/targets.go` |
| `sync/local/retention.ts` | `cli/sync/local/retention.go` |
| `sync/local/selection.ts` | `cli/sync/local/reconcile/selection.go` |
| `sync/local/unpublished.ts` | `cli/sync/local/reconcile/unpublished.go` |
| `sync/local/validation/collisions.ts` | `cli/sync/local/validation/collisions.go` |
| `sync/local/validation/entries.ts` | `cli/sync/local/validation/entries.go` |
| `sync/local/validation/size.ts` | `cli/sync/local/validation/size.go` |
| `sync/model.ts` | `cli/sync/model/model.go` |
| `sync/remote/accept.ts` | `cli/sync/remote/accept.go` |
| `sync/remote/attempt/blocked.ts` | `cli/sync/remote/attempt/blocked.go` |
| `sync/remote/attempt/notices.ts` | `cli/sync/remote/attempt/notices.go` |
| `sync/remote/attempt/record.ts` | `cli/sync/remote/attempt/record.go` |
| `sync/remote/attempt/state.ts` | `cli/sync/remote/attempt/state/state.go` |
| `sync/remote/content.ts` | `cli/sync/remote/content.go` |
| `sync/remote/context.ts` | `cli/sync/remote/context.go` |
| `sync/remote/persist.ts` | `cli/sync/remote/persist.go` |
| `sync/remote/push.ts` | `cli/sync/remote/push/push.go` |
| `sync/remote/repairs.ts` | `cli/sync/remote/repairs.go` |
| `sync/remote/seal.ts` | `cli/sync/remote/seal.go` |
| `sync/remote/upload.ts` | `cli/sync/remote/push/upload.go` |
| `sync/removal/backups.ts` | `cli/sync/removal/backups.go` |
| `sync/removal/selection.ts` | `cli/sync/removal/selection.go` |
| `sync/remove.ts` | `cli/sync/remove.go` |
| `sync/resolve.ts` | `cli/sync/resolve.go` |
| `time/format.ts` | `cli/time/format.go` |
| `ui/actions/options.ts` | `cli/ui/actions/options.go` |
| `ui/actions/restore.ts` | `cli/ui/actions/restore.go` |
| `ui/browser.ts` | `cli/ui/browser.go` |
| `ui/page/api.ts` | `cli/ui/assets/api.ts` |
| `ui/page/history.ts` | `cli/ui/assets/history.ts` |
| `ui/page/index.html` | `cli/ui/assets/index.html` |
| `ui/page/main.ts` | `cli/ui/assets/main.ts` |
| `ui/page/notice.ts` | `cli/ui/assets/notice.ts` |
| `ui/page/rename.ts` | `cli/ui/assets/rename.ts` |
| `ui/page/render/chip.ts` | `cli/ui/assets/render/chip.ts` |
| `ui/page/render/conflicts.ts` | `cli/ui/assets/render/conflicts.ts` |
| `ui/page/render/devices/list.ts` | `cli/ui/assets/render/devices/list.ts` |
| `ui/page/render/devices/rename.ts` | `cli/ui/assets/render/devices/rename.ts` |
| `ui/page/render/dom.ts` | `cli/ui/assets/render/dom.ts` |
| `ui/page/render/history/changes.ts` | `cli/ui/assets/render/history/changes.ts` |
| `ui/page/render/history/pane.ts` | `cli/ui/assets/render/history/pane.ts` |
| `ui/page/render/keys.ts` | `cli/ui/assets/render/keys.ts` |
| `ui/page/render/overview.ts` | `cli/ui/assets/render/overview.ts` |
| `ui/page/render/repos.ts` | `cli/ui/assets/render/repos.ts` |
| `ui/page/render/reveal.ts` | `cli/ui/assets/render/reveal.ts` |
| `ui/page/render/window.ts` | `cli/ui/assets/render/window.ts` |
| `ui/page/styles.css` | `cli/ui/assets/styles.css` |
| `ui/page/tsconfig.json` | `cli/ui/assets/tsconfig.json` |
| `ui/routes/api.ts` | `cli/ui/routes/api.go` |
| `ui/routes/inputs/file.ts` | `cli/ui/routes/inputs/file.go` |
| `ui/routes/inputs/parse.ts` | `cli/ui/routes/inputs/parse.go` |
| `ui/routes/inputs/rename.ts` | `cli/ui/routes/inputs/rename.go` |
| `ui/routes/inputs/resolve.ts` | `cli/ui/routes/inputs/resolve.go` |
| `ui/routes/inputs/restore.ts` | `cli/ui/routes/inputs/restore.go` |
| `ui/routes/page.ts` | `cli/ui/routes/page.go` |
| `ui/server/app.ts` | `cli/ui/server/app.go` |
| `ui/server/assets.ts` | `cli/ui/server/assets/assets.go` |
| `ui/server/errors.ts` | `cli/ui/server/errors.go` |
| `ui/server/headers.ts` | `cli/ui/server/headers.go` |
| `ui/server/host.ts` | `cli/ui/server/host.go` |
| `ui/server/token.ts` | `cli/ui/server/token.go` |
| `ui/start.ts` | `cli/ui/start.go` |
| `ui/view/conflicts.ts` | `cli/ui/view/conflicts.go` |
| `ui/view/file-status.ts` | `cli/ui/view/file_status.go` |
| `ui/view/guidance/held.ts` | `cli/ui/view/guidance/held.go` |
| `ui/view/guidance/restore.ts` | `cli/ui/view/guidance/restore.go` |
| `ui/view/key-changes.ts` | `cli/ui/view/key_changes.go` |
| `ui/view/model.ts` | `cli/ui/view/model.go` |
| `ui/view/repos.ts` | `cli/ui/view/repos.go` |
| `ui/view/status.ts` | `cli/ui/view/status/status.go` |
| `ui/view/summary.ts` | `cli/ui/view/summary.go` |
| `ui/view/unlock/probe.ts` | `cli/ui/view/unlock/probe.go` |
| `ui/view/unlock/state.ts` | `cli/ui/view/unlock/state.go` |
| `ui/view/unlock/text.ts` | `cli/ui/view/unlock/text.go` |
| `updates/cache.ts` | `cli/updates/cache.go` |
| `updates/check.ts` | `cli/updates/check/check.go` |
| `updates/github.ts` | `cli/updates/check/github.go` |
| `updates/install.ts` | `cli/updates/install.go` |
| `updates/replace.ts` | `cli/updates/replace.go` |
| `updates/run.ts` | `cli/updates/check/run.go` |
| `updates/self/download.ts` | `cli/updates/self/download.go` |
| `updates/self/execute.ts` | `cli/updates/self/execute.go` |
| `updates/self/lock.ts` | `cli/updates/self/lock.go` |
| `updates/self/maintenance.ts` | `cli/updates/self/maintenance.go` |
| `updates/self/paths.ts` | `cli/updates/self/paths.go` |
| `updates/self/platform.ts` | `cli/updates/self/platform.go` |
| `updates/self.ts` | `cli/updates/self/self.go` |
| `updates/status.ts` | `cli/updates/status.go` |
| `vault/add.ts` | `cli/vault/add.go` |
| `vault/connection.ts` | `cli/vault/connection.go` |
| `vault/creation.ts` | `cli/vault/creation.go` |
| `vault/files/retained.ts` | `cli/vault/files/retained.go` |
| `vault/genesis.ts` | `cli/vault/genesis.go` |
| `vault/history.ts` | `cli/vault/history.go` |
| `vault/initial/entries.ts` | `cli/vault/initial/entries.go` |
| `vault/initial/push.ts` | `cli/vault/initial/push.go` |
| `vault/initial/record.ts` | `cli/vault/initial/record.go` |
| `vault/initial/resume.ts` | `cli/vault/initial/resume.go` |
| `vault/join/accept.ts` | `cli/vault/join/accept.go` |
| `vault/join/advance.ts` | `cli/vault/join/advance.go` |
| `vault/join/floor.ts` | `cli/vault/join/floor.go` |
| `vault/join/local-state.ts` | `cli/vault/join/local_state.go` |
| `vault/join/material.ts` | `cli/vault/join/material/material.go` |
| `vault/join/validation.ts` | `cli/vault/join/material/validation.go` |
| `vault/keys/wrap.ts` | `cli/vault/keys/wrap.go` |
| `vault/named.ts` | `cli/vault/named.go` |
| `vault/recovery/attempt.ts` | `cli/vault/recovery/attempt.go` |
| `vault/recovery/input.ts` | `cli/vault/recovery/input.go` |
| `vault/recovery/key.ts` | `cli/vault/recovery/key.go` |
| `vault/recovery/kit.ts` | `cli/vault/recovery/kit.go` |
| `vault/recovery/output.ts` | `cli/vault/recovery/output.go` |
| `vault/recovery/pdf/folder.ts` | `cli/vault/recovery/pdf/folder.go` |
| `vault/recovery/pdf/layout.ts` | `cli/vault/recovery/pdf/layout.go` |
| `vault/recovery/pdf/model.ts` | `cli/vault/recovery/pdf/model.go` |
| `vault/recovery/pdf/name.ts` | `cli/vault/recovery/pdf/name.go` |
| `vault/recovery/pdf/report.ts` | `cli/vault/recovery/pdf/report.go` |
| `vault/recovery/pdf/save.ts` | `cli/vault/recovery/pdf/save.go` |
| `vault/recovery/pending-kit.ts` | `cli/vault/recovery/pending_kit.go` |
| `vault/recovery/read.ts` | `cli/vault/recovery/read.go` |
| `vault/recovery/resume.ts` | `cli/vault/recovery/resume.go` |
| `vault/setup.ts` | `cli/vault/setup/setup.go` |
| `version.ts` | `cli/version/version.go` |
