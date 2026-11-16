# Sweep 1

Reference: frozen TypeScript working tree. Checked items below list steps in execution order.

## Compared functions

- [x] output/exit-code.errorExitCode: STORAGE_QUOTA=1; CONFLICT=3; INVALID_INPUT/NOT_IMPLEMENTED=2; others=1. Rust output/errors.rs matches.
- [x] output/quiet-commands.skipsNotices: JSON short circuit; quiet-name membership. Rust output/errors.rs matches.
- [x] output/sanitize.sanitizeTerminal: remove controls and listed bidi characters. Rust forbidden/sanitize_terminal matches.
- [x] output/sanitize.sanitizeConsole: preserve LF/tab; strip other forbidden characters. Rust sanitize_console matches.
- [x] output/sanitize.terminalJson: recursively clean string values; serialize compact JSON; preserve keys. Rust terminal_json matches.
- [x] output/telemetry/report.telemetryPayload: error-code validation; optional safe nonnegative counts; null IP; disable geo; wrap event. Rust telemetry_payload matches typed error codes/counts.
- [x] output/telemetry/report.reportTelemetry: missing build key exits; config/privacy checks; state lock; read/create install UUID; persist; background send; swallow failures. Rust report_telemetry matches.
- [x] output/telemetry/background.childEnvironment: telemetry body/no-update; pass nonempty home and named proxy/certificate settings. Rust child_environment additionally passes lowercase envden_home; gap pending.
- [x] output/telemetry/background.deliverTelemetry: empty body exits; POST JSON; 10s timeout; no redirects; ignore failure. Rust deliver_telemetry matches.
- [x] output/prompts/token.readToken: TTY without option prompts/validates; otherwise explicit value or piped token; decode; return. Rust read_token matches.
- [x] output/prompts/token.piped: gather bytes; UTF8 replacement; ECMAScript trim; reject empty with fixed message. Rust token.rs trim fixed.
- [x] output/render/devices/device-list.deviceListText: empty message; maximum UTF16 name width; details; padding; trimEnd; join LF; sanitize. Rust device_list_text trim fixed.
- [x] output/render/devices/device-list.deviceDetails: current marker; confirmation/version; held keys; verbose id. Rust device_list_text matches.
- [x] output/render/sync/sync.syncText: direction verb; optional changed text; no-conflict fallback; pending conflict summary. Rust sync_text matches.
- [x] output/render/sync/sync.plural: count plus noun; plural except one. Rust inline branches match.
- [x] settings/config.parseConfig: strict fields; optional placement/rules; four boolean defaults. Rust parse_config matches accepted JSON.
- [x] settings/config.readConfig: read/parse; missing defaults; pass config errors; other errors INVALID_DATA. Rust read_config checked; UTF8 replacement difference pending.
- [x] settings/config.setConfig: terminal-only guard; lock; read; parse value; validate; ensure directories; atomic pretty JSON+LF; return. Rust set_config matches.
- [x] settings/config.parseToggle: accept on/off only; boolean result. Rust set_config matches.
- [x] settings/config.parseStructured: JSON parse; fixed INVALID_INPUT with cause. Rust set_config matches.
- [x] settings/paths.ensurePaths: home/store/state/base/conflicts in order; mkdir 0700; chmod existing; return. Rust ensure_paths matches filesystem operations.
- [x] settings/request.settingRequest: list; validate key; read; placement validation; extra-value error; unlock validation; toggle validation; set. Rust setting_request matches.
- [x] settings/request.isSetting: membership in fixed list. Rust SETTINGS.contains matches.
- [x] settings/placement.setCheckoutPlacement: mode guard; checkout lookup; lock; read; merge placement; setConfig. Rust actions/set_checkout_placement matches.
- [x] settings/privacy.telemetryEnabled: environment disable overrides; configured default false. Rust report_telemetry matches.
- [x] settings/unlock-period.unlockPeriod: 1d/7d/30d/never; fixed invalid error. Rust unlock_period matches.
- [x] settings/unlock-period.setUnlockPeriod: parse period; configured state; connection; login; PUT. Rust actions/set_unlock_period matches.
- [x] settings/unlock-period.getUnlockPeriod: configured state; connection; GET; decode response. Rust actions/get_unlock_period matches.
- [x] commands/sync/alias action: adapters; alias; success output. Rust alias/run matches.
- [x] commands/sync/diff action: adapters/options; diff; JSON/text; print. Rust diff/run matches.
- [x] commands/sync/history action: adapters/common; list unless restore; missing-file error; restore; JSON/text. Rust history/run has restore version parsing gap pending.
- [x] commands/sync/pull action: options; pull; JSON or clean text; conflict error. Rust transfer/run matches.
- [x] commands/sync/push action: options; push; conflicts OR conflict-kind; JSON or clean text; conflict error. Rust transfer/run misses conflict-kind; gap pending.
- [x] commands/sync/resolve action: list branch; noninteractive choice guard/config; resolve; JSON/text. Rust resolve/run matches.
- [x] commands/sync/resolve.resolutionChoice: keep first; take next; default edit. Rust resolve/run matches.
- [x] commands/sync/rm action: remove with consent/report; JSON or skipped lines and outcome. Rust rm/run matches.
- [x] commands/sync/status action: refresh-cache early return; report; notice refresh; JSON/text with real home. Rust status/run misses realHome; pending.
- [x] commands/server/move action: continuing detection; missing destination guard; address then token then password; move; output. Rust moving/run matches.
- [x] commands/server/switch action: switch; success output. Rust moving/run matches.
- [x] commands/server/port.parsePort: ASCII digits 1..5; range 0..65535; fixed argument error. Rust option_value matches.
- [x] commands/server/serve.setupTokenFrom: read; remove env entry; include nonempty. Rust setup_token_from matches local environment map; process env retained, gap pending.
- [x] commands/server/serve action: options/setup token; serve; stay alive until shutdown. Rust SIGTERM fix under test.
- [x] commands/server/repair action: read token first; finish password/options/render/kit offer; otherwise upload/message. Rust repair/run matches.
- [x] commands/server/repair.offerReplacementKit: finished+replaceKit; consent; replace flow. Rust repair/run matches.
- [x] commands/checkouts/track action: adapters; lock; configured state; scan options. Rust onboarding/run_track matches call shape, implementation owned elsewhere.
- [x] commands/checkouts/untrack action: untrack; cancelled lines in order. Rust untrack/run matches.
- [x] commands/checkouts/local-only action: resolve; lock; configured state; find matching link; NOT_FOUND guard; markLocalOnly. Rust local_only/run matches normalized file identity.
- [x] ui/server/host.allowedHost: exact loopback hostname and port. Rust allowed_host matches.
- [x] ui/server/host.sameOrigin: both nonempty; exact http origin/host. Rust same_origin matches.
- [x] ui/server/token.newToken: random 32 bytes; base64url unpadded. Rust new_token matches.
- [x] ui/server/token.tokenMatches: strict Bearer prefix; default empty; UTF8; constant-time compare. Rust token_matches matches.
- [x] ui/server/errors.errorStatus: bad request/refused/not-found/outdated/not-implemented/upstream/internal/default mapping. Rust error_status matches.
- [x] ui/server/app.createDashboardApp: headers on responses; host guard; API auth; mutation origin guard; API routes; page routes. Rust respond matches dispatch order; body consumed before guards is a pending gap.
- [x] ui/routes/inputs/parse.parseInput: strict schema; INVALID_INPUT fixed message; return data. Rust inputs/parse matches except integer JSON floats; failing regression added.
- [x] ui/start.validPort: integer, positive, below 65536. Rust run_dashboard guard matches.
- [x] ui/start.runDashboard: interactive guard; port guard; token/assets; listen; app/url; report; open browser; wait; force stop. Rust uses graceful rather than forced stop; pending.
- [x] main.runCli: update wrapper; parse; CLIENT_TOO_OLD marker; sanitize error; map exit; report. Rust main matches coarse ordering; terminal-output guard is explicit per emitter.
- [x] program.createProgram: command tree; preAction time/state/untrusted roots; refresh-cache telemetry suppression; quiet notice skip; notice; groups; outcome report. Rust dispatch/tree matches coarse order; counts are not scoped/reset around dispatch, pending.
- [x] program.commandName: leaf and ancestors excluding root; space join. Rust command.path.join matches.
- [x] server/main.serve: keys/storage; setup; restore; status/app; listener; report; schedule prune; shutdown cancels jobs/removes signal handlers/stops listener/closes storage; close on failure. Rust lifecycle and CLI signal path checked; accept diagnostic gap fixed separately.

## Not yet compared

Remaining render/progress/prompts, UI views/actions/routes/browser/page functions, command definitions outside the checked action list, and remaining program helpers need a full comparison. This checklist does not claim a complete sweep.

## Additional compared functions

- [x] output/prompts/questions.answer: symbol means cancellation; otherwise return. Rust terminal/cancelled uses the same error code/message at cancellation sites.
- [x] output/prompts/questions.terminal: TTY guard; strip trailing question/colon/period; fixed actionable error. Rust require_terminal matches.
- [x] output/prompts/questions.secret: terminal guard; sanitized label; reject empty; custom check; answer. Rust secret/ask matches validation order.
- [x] output/prompts/questions.input: terminal guard; initial value; required/custom validation; answer. Rust input/ask matches.
- [x] output/prompts/questions.consent: terminal guard; sanitized label; initial bool; cancellation. Rust consent matches.
- [x] output/prompts/questions.choose: terminal guard; initial choice; sanitized labels; cancellation; selected value. Rust choose/run matches.
- [x] output/prompts/questions.chooseMany: terminal guard; optional empty selection; all selected initially; sanitized labels; cancellation. Rust choose_many/run matches.
- [x] output/progress/scan.scanProgress: disabled is silent; sanitized location; start at zero; found update; singular/plural completion; abort clear. Rust scan_progress/found/done/abort matches text and branching; exact Clack animation bytes not verified.
- [x] ui/browser.browserCommand: darwin open; win32 rundll32; other xdg-open; URL separate argument. Rust browser_command matches.
- [x] ui/browser.openBrowser: trusted spawn; ignored output; success exit; errors false. Rust exec_trusted path matches.
- [x] ui/view/file-status.fileStatus: local-only; conflict; detached; held; missing; local change; remote/in-sync. Rust files/file_status matches priority.
- [x] ui/view/file-status.pendingCount: exclude in-sync/local-only; count. Rust pending_count matches.
- [x] ui/view/file-status.mostUrgent: fixed urgency-order membership; default in-sync. Rust most_urgent matches.
- [x] ui/view/summary.syncSummary: direction; changed count; singular only for one conflict. Rust sync_summary matches integer counts.
- [x] ui/view/key-changes.keyChanges: diff arrays or unparsed reason/optional truthy key. Rust key_changes/conflict_views checked; empty optional key handling needs tracing.
- [x] ui/view/unlock/state.deriveUnlock: server locked wins; unlocked never/until/unrecorded; unreachable uses recorded never/unknown/until/locked. Rust derive_unlock matches.
- [x] ui/view/unlock/probe.probeUnlock: GET period; success unlocked; LOCKED becomes locked; other failure unreachable. Rust dashboard_status probe match matches.
- [x] ui/routes/api.apiRoutes: status/devices; pull/push; strict resolve/rename; strict history query then first-file guard/time; strict restore. Rust api dispatch checked; integer-number regression fixed.

## Embedded dashboard evidence

A fresh `Bun.build` of apps/cli/src/ui/page/index.html produced index.html, chunk-jtq8kjdg.js, and chunk-9nqj0wqq.css byte-for-byte identical to Rust's embedded assets. See ui-assets.log. The page UI and its bundled guidance/text functions therefore execute the same compiled code. This is bundle identity evidence, not a claimed separate function-by-function review of those frontend functions.
- [x] commands/maintenance/config action: validate whole request; adapters; apply; print. Rust dispatch config matches.
- [x] commands/maintenance/config.applySetting: list/read/placement/unlock/set branches; configured guard before password. Rust settings/actions matches.
- [x] commands/maintenance/doctor action: adapters; doctor; JSON/text output. Rust doctor/run matches call order.
- [x] commands/maintenance/version action: print VERSION. Rust DefaultActions matches.
- [x] commands/maintenance/update action: capture command time; post-install early return; check/self-update; JSON. Rust update/run checked; captures clock only in check branch rather than before post-install; pending exact clock-order gap.
- [x] commands/device/add action: create adapters; device-add flow. Rust add/run delegates to pairing/add.
- [x] commands/device/ls action: list; JSON or verbose text. Rust ls/run matches.
- [x] commands/device/rename action: rename; unchanged or sanitized-name message. Rust rename/run matches.
- [x] commands/device/rm action: replacement output; removal/new-kit/exposure confirmation; fail output handling; finished/default message. Rust rm/run matches delegated removal call and output.
- [x] ui/actions/options.dashboardSyncOptions: injected now/fetch; all; yes; noninteractive. Rust routes/api/options matches.
- [x] ui/actions/restore.dashboardRestoreOptions: target root/file/version; yes; interactive; true confirmation; clock/fetch. Rust restore branch matches.
