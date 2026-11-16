# Cross-implementation coverage

## Missing counterparts

- Go and Rust: `NEXT_PUBLIC_POSTHOG_KEY`. This belongs to the Next.js marketing site, which neither port implements.
- Rust: `ENVDEN_RC_PATH`. TS and Go pass this internal variable to a PowerShell ownership helper; Rust checks Windows ownership through native APIs (`rust/adapters/shell/rc/src/windows.rs`).
- Go and Rust: `E2E_KEEP`. This controls retention in the TS e2e runner; the ports use the reference runner rather than duplicating it.

No public CLI/server feature below has a missing source counterpart. This is a source inventory, not a claim that every input has been tested across runtimes. Colour overrides are dependency-owned and still need a terminal comparison. B14 remains open.

## Scope and revisions

Paths are relative to the implementation's branch root. TS: `ae59d56694789410878b00d4f0c010b7b04af7aa` (`fix/cross-impl`). Go: read-only worktree scan began at `e070015f19c79d62aa2777d0864aa6af801c57e0` and ended at `67be9e2d3a55348684eec657ece1e56b46fda266`; another agent committed during the scan. Go paths reflect observed source, not an immutable snapshot. Rust: fetched `origin/port/rust`, `10c35bd87232918f29d412d0a4240a19712c5f47`. Port branches can move after this snapshot.

`H` is `ENVDEN_HOME` or `U/.envden` (empty override means unset). `U` is the user's home. `D` is `serve --data-dir`, normally `H/server`. A port path identifies the implementation or validator, including shared dispatchers. Repeated prompt call sites share a question-template row. File rows include the state format; temporary files are listed separately where they have a distinct pattern. Tests, fixtures and build outputs are excluded from runtime coverage; the environment table explicitly labels build/site/test-only reads.

## CLI commands

44 rows.

| Item | TS (path) | Go (path or MISSING) | Rust (path or MISSING) | Note |
| --- | --- | --- | --- | --- |
| `envden` | `apps/cli/src/program.ts` | `go/cli/program/program.go` | `rust/cli/src/program/commands.json` |  |
| `envden setup` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` |  |
| `envden join` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/getstarted/join.go` | `rust/cli/src/program/commands.json` | Arguments: server |
| `envden status` | `apps/cli/src/commands/sync/status.ts` | `go/cli/program/dailyuse/status.go` | `rust/cli/src/program/commands.json` |  |
| `envden push` | `apps/cli/src/commands/sync/push.ts` | `go/cli/program/dailyuse/push.go` | `rust/cli/src/program/commands.json` |  |
| `envden pull` | `apps/cli/src/commands/sync/pull.ts` | `go/cli/program/dailyuse/pull.go` | `rust/cli/src/program/commands.json` |  |
| `envden diff` | `apps/cli/src/commands/sync/diff.ts` | `go/cli/program/dailyuse/diff.go` | `rust/cli/src/program/commands.json` |  |
| `envden resolve` | `apps/cli/src/commands/sync/resolve.ts` | `go/cli/program/dailyuse/resolve.go` | `rust/cli/src/program/commands.json` | Arguments: file |
| `envden history` | `apps/cli/src/commands/sync/history.ts` | `go/cli/program/dailyuse/history.go` | `rust/cli/src/program/commands.json` | Arguments: file |
| `envden track` | `apps/cli/src/commands/checkouts/track.ts` | `go/cli/program/files/track.go` | `rust/cli/src/program/commands.json` | Arguments: path |
| `envden untrack` | `apps/cli/src/commands/checkouts/untrack.ts` | `go/cli/program/files/untrack.go` | `rust/cli/src/program/commands.json` | Arguments: path |
| `envden local-only` | `apps/cli/src/commands/checkouts/local-only.ts` | `go/cli/program/files/local_only.go` | `rust/cli/src/program/commands.json` | Arguments: file |
| `envden rm` | `apps/cli/src/commands/sync/rm.ts` | `go/cli/program/files/rm.go` | `rust/cli/src/program/commands.json` | Arguments: path |
| `envden alias` | `apps/cli/src/commands/sync/alias.ts` | `go/cli/program/files/alias.go` | `rust/cli/src/program/commands.json` | Arguments: repo, target |
| `envden device` | `apps/cli/src/commands/device/device.ts` | `go/cli/program/devicesandvault/device.go` | `rust/cli/src/program/commands.json` |  |
| `envden device add` | `apps/cli/src/commands/device/add.ts` | `go/cli/program/devicesandvault/device.go` | `rust/cli/src/program/commands.json` |  |
| `envden device ls` | `apps/cli/src/commands/device/ls.ts` | `go/cli/program/devicesandvault/ls.go` | `rust/cli/src/program/commands.json` |  |
| `envden device rename` | `apps/cli/src/commands/device/rename.ts` | `go/cli/program/devicesandvault/rename.go` | `rust/cli/src/program/commands.json` | Arguments: name |
| `envden device rm` | `apps/cli/src/commands/device/rm.ts` | `go/cli/program/devicesandvault/device.go` | `rust/cli/src/program/commands.json` | Arguments: device |
| `envden vault` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/devicesandvault/vault.go` | `rust/cli/src/program/commands.json` |  |
| `envden vault rotate` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/devicesandvault/vault.go` | `rust/cli/src/program/commands.json` |  |
| `envden vault kit` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/devicesandvault/vault.go` | `rust/cli/src/program/commands.json` |  |
| `envden vault kit replace` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/devicesandvault/vault.go` | `rust/cli/src/program/commands.json` |  |
| `envden vault password` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/devicesandvault/vault.go` | `rust/cli/src/program/commands.json` |  |
| `envden vault password change` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/devicesandvault/vault.go` | `rust/cli/src/program/commands.json` |  |
| `envden vault password reset` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/devicesandvault/vault.go` | `rust/cli/src/program/commands.json` |  |
| `envden server` | `apps/cli/src/commands/server/server.ts` | `go/cli/program/devicesandvault/server.go` | `rust/cli/src/program/commands.json` |  |
| `envden server move` | `apps/cli/src/commands/server/move.ts` | `go/cli/program/devicesandvault/move.go` | `rust/cli/src/program/commands.json` | Arguments: server |
| `envden server switch` | `apps/cli/src/commands/server/switch.ts` | `go/cli/program/devicesandvault/switch.go` | `rust/cli/src/program/commands.json` | Arguments: server |
| `envden server repair` | `apps/cli/src/commands/server/repair.ts` | `go/cli/program/devicesandvault/repair.go` | `rust/cli/src/program/commands.json` |  |
| `envden unlock` | `apps/cli/src/commands/onboarding/unlock.ts` | `go/cli/program/devicesandvault/unlock.go` | `rust/cli/src/program/commands.json` |  |
| `envden config` | `apps/cli/src/commands/maintenance/config.ts` | `go/cli/program/maintenance/config.go` | `rust/cli/src/program/commands.json` | Arguments: key, values |
| `envden doctor` | `apps/cli/src/commands/maintenance/doctor.ts` | `go/cli/program/maintenance/doctor.go` | `rust/cli/src/program/commands.json` |  |
| `envden update` | `apps/cli/src/commands/maintenance/update.ts` | `go/cli/program/maintenance/update.go` | `rust/cli/src/program/commands.json` |  |
| `envden ui` | `apps/cli/src/commands/ui/ui.ts` | `go/cli/program/maintenance/ui.go` | `rust/cli/src/program/commands.json` |  |
| `envden agent` | `apps/cli/src/commands/agent/agent.ts` | `go/cli/program/maintenance/agent.go` | `rust/cli/src/program/commands.json` |  |
| `envden agent install` | `apps/cli/src/commands/agent/install.ts` | `go/cli/program/maintenance/agent.go` | `rust/cli/src/program/commands.json` |  |
| `envden shell` | `apps/cli/src/commands/shell/shell.ts` | `go/cli/program/maintenance/shell.go` | `rust/cli/src/program/commands.json` |  |
| `envden shell install` | `apps/cli/src/commands/shell/shell.ts` | `go/cli/program/maintenance/shell.go` | `rust/cli/src/program/commands.json` | Arguments: shell |
| `envden shell uninstall` | `apps/cli/src/commands/shell/shell.ts` | `go/cli/program/maintenance/shell.go` | `rust/cli/src/program/commands.json` | Arguments: shell |
| `envden serve` | `apps/cli/src/commands/server/serve.ts` | `go/cli/program/maintenance/serve.go` | `rust/cli/src/program/commands.json` |  |
| `envden version` | `apps/cli/src/commands/maintenance/version.ts` | `go/cli/program/maintenance/version.go` | `rust/cli/src/program/commands.json` |  |
| `help [command...] (at every group)` | `apps/cli/src/program.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/help.rs` | Commander implicit help command. |
| `telemetry-send (internal argv dispatch)` | `apps/cli/src/main.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/main.rs` | Hidden child process; bypasses parser. |

## CLI options

109 rows.

| Item | TS (path) | Go (path or MISSING) | Rust (path or MISSING) | Note |
| --- | --- | --- | --- | --- |
| `envden -V, --version` | `apps/cli/src/program.ts` | `go/cli/program/program.go` | `rust/cli/src/program/commands.json` | output the version number |
| `envden -h, --help` | `apps/cli/src/program.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden setup --yes` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Take defaults; secrets and checkout approval still require your terminal |
| `envden setup --server <url>` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Use this server |
| `envden setup --kit-out <file>` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Write the recovery kit as JSON to a private file instead of a PDF |
| `envden setup --name <name>` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Device name |
| `envden setup --host-server` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Run the envden server on this machine; no setup token needed |
| `envden setup --setup-token <token>` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Setup token, visible to other processes; use the prompt in a terminal |
| `envden setup --telemetry <choice>` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Anonymous telemetry |
| `envden setup --update-check <choice>` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Daily update check |
| `envden setup --shell <shell>` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Shell notice |
| `envden setup --agent <choice>` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Install the agent skill |
| `envden setup --scan-root <path...>` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Roots to scan for repos |
| `envden setup --exclude-root <path...>` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Roots to skip |
| `envden setup --verbose` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | List each repo and env file the scan skipped |
| `envden setup -h, --help` | `apps/cli/src/commands/onboarding/setup.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden join --recovery` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/getstarted/join.go` | `rust/cli/src/program/commands.json` | Paste a recovery secret key and vault ID |
| `envden join --recovery-kit <path>` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/getstarted/join.go` | `rust/cli/src/program/commands.json` | Recovery kit path |
| `envden join --name <name>` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/getstarted/join.go` | `rust/cli/src/program/commands.json` | Device name |
| `envden join --yes` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/getstarted/join.go` | `rust/cli/src/program/commands.json` | Use default preferences |
| `envden join --telemetry <choice>` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/getstarted/join.go` | `rust/cli/src/program/commands.json` | Anonymous telemetry |
| `envden join --update-check <choice>` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/getstarted/join.go` | `rust/cli/src/program/commands.json` | Daily update check |
| `envden join --shell <shell>` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/getstarted/join.go` | `rust/cli/src/program/commands.json` | Shell notice |
| `envden join --agent <choice>` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/getstarted/join.go` | `rust/cli/src/program/commands.json` | Install the agent skill |
| `envden join --resume` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/getstarted/join.go` | `rust/cli/src/program/commands.json` | Finish a join that was approved while this command wasn't running |
| `envden join -h, --help` | `apps/cli/src/commands/onboarding/join.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden status --json` | `apps/cli/src/commands/sync/status.ts` | `go/cli/program/dailyuse/status.go` | `rust/cli/src/program/commands.json` | Machine-readable status |
| `envden status --refresh-cache` | `apps/cli/src/commands/sync/status.ts` | `go/cli/program/dailyuse/status.go` | `rust/cli/src/program/commands.json` | Hidden.  |
| `envden status -h, --help` | `apps/cli/src/commands/sync/status.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden push --json` | `apps/cli/src/commands/sync/push.ts` | `go/cli/program/dailyuse/push.go` | `rust/cli/src/program/commands.json` | Print the result as JSON |
| `envden push --all` | `apps/cli/src/commands/sync/push.ts` | `go/cli/program/dailyuse/push.go` | `rust/cli/src/program/commands.json` | Sync all repos |
| `envden push --yes` | `apps/cli/src/commands/sync/push.ts` | `go/cli/program/dailyuse/push.go` | `rust/cli/src/program/commands.json` | Confirm clean changes |
| `envden push -h, --help` | `apps/cli/src/commands/sync/push.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden pull --json` | `apps/cli/src/commands/sync/pull.ts` | `go/cli/program/dailyuse/pull.go` | `rust/cli/src/program/commands.json` | Print the result as JSON |
| `envden pull --all` | `apps/cli/src/commands/sync/pull.ts` | `go/cli/program/dailyuse/pull.go` | `rust/cli/src/program/commands.json` | Sync all repos |
| `envden pull --yes` | `apps/cli/src/commands/sync/pull.ts` | `go/cli/program/dailyuse/pull.go` | `rust/cli/src/program/commands.json` | Confirm clean changes |
| `envden pull -h, --help` | `apps/cli/src/commands/sync/pull.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden diff --json` | `apps/cli/src/commands/sync/diff.ts` | `go/cli/program/dailyuse/diff.go` | `rust/cli/src/program/commands.json` | Print the result as JSON |
| `envden diff --all` | `apps/cli/src/commands/sync/diff.ts` | `go/cli/program/dailyuse/diff.go` | `rust/cli/src/program/commands.json` | Include all repos |
| `envden diff -h, --help` | `apps/cli/src/commands/sync/diff.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden resolve --json` | `apps/cli/src/commands/sync/resolve.ts` | `go/cli/program/dailyuse/resolve.go` | `rust/cli/src/program/commands.json` | Print the result as JSON |
| `envden resolve --list` | `apps/cli/src/commands/sync/resolve.ts` | `go/cli/program/dailyuse/resolve.go` | `rust/cli/src/program/commands.json` | List unresolved conflicts |
| `envden resolve --repo <path>` | `apps/cli/src/commands/sync/resolve.ts` | `go/cli/program/dailyuse/resolve.go` | `rust/cli/src/program/commands.json` | Select a checkout |
| `envden resolve --keep-mine` | `apps/cli/src/commands/sync/resolve.ts` | `go/cli/program/dailyuse/resolve.go` | `rust/cli/src/program/commands.json` | Keep your version |
| `envden resolve --take-server` | `apps/cli/src/commands/sync/resolve.ts` | `go/cli/program/dailyuse/resolve.go` | `rust/cli/src/program/commands.json` | Take the server's version |
| `envden resolve -h, --help` | `apps/cli/src/commands/sync/resolve.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden history --all` | `apps/cli/src/commands/sync/history.ts` | `go/cli/program/dailyuse/history.go` | `rust/cli/src/program/commands.json` | Include every tracked file |
| `envden history --restore <version>` | `apps/cli/src/commands/sync/history.ts` | `go/cli/program/dailyuse/history.go` | `rust/cli/src/program/commands.json` | Write that version into the checkout without pushing |
| `envden history --yes` | `apps/cli/src/commands/sync/history.ts` | `go/cli/program/dailyuse/history.go` | `rust/cli/src/program/commands.json` | Confirm the restore |
| `envden history --json` | `apps/cli/src/commands/sync/history.ts` | `go/cli/program/dailyuse/history.go` | `rust/cli/src/program/commands.json` | Print the result as JSON |
| `envden history -h, --help` | `apps/cli/src/commands/sync/history.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden track --copy` | `apps/cli/src/commands/checkouts/track.ts` | `go/cli/program/files/track.go` | `rust/cli/src/program/commands.json` | Place real copies instead of links |
| `envden track --verbose` | `apps/cli/src/commands/checkouts/track.ts` | `go/cli/program/files/track.go` | `rust/cli/src/program/commands.json` | List each repo and env file the scan skipped |
| `envden track -h, --help` | `apps/cli/src/commands/checkouts/track.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden untrack -h, --help` | `apps/cli/src/commands/checkouts/untrack.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden local-only -h, --help` | `apps/cli/src/commands/checkouts/local-only.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden rm --yes` | `apps/cli/src/commands/sync/rm.ts` | `go/cli/program/files/rm.go` | `rust/cli/src/program/commands.json` | Confirm deletion, including local edits and conflicts |
| `envden rm --json` | `apps/cli/src/commands/sync/rm.ts` | `go/cli/program/files/rm.go` | `rust/cli/src/program/commands.json` | Print the result as JSON |
| `envden rm -h, --help` | `apps/cli/src/commands/sync/rm.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden alias -h, --help` | `apps/cli/src/commands/sync/alias.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden device -h, --help` | `apps/cli/src/commands/device/device.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden device add -h, --help` | `apps/cli/src/commands/device/add.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden device ls --json` | `apps/cli/src/commands/device/ls.ts` | `go/cli/program/devicesandvault/ls.go` | `rust/cli/src/program/commands.json` | Print the result as JSON |
| `envden device ls --verbose` | `apps/cli/src/commands/device/ls.ts` | `go/cli/program/devicesandvault/ls.go` | `rust/cli/src/program/commands.json` | Include device ids |
| `envden device ls -h, --help` | `apps/cli/src/commands/device/ls.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden device rename -h, --help` | `apps/cli/src/commands/device/rename.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden device rm --kit-out <file>` | `apps/cli/src/commands/device/rm.ts` | `go/cli/program/devicesandvault/device.go` | `rust/cli/src/program/commands.json` | Write the new recovery kit as JSON to a private file instead of a PDF |
| `envden device rm --new-kit` | `apps/cli/src/commands/device/rm.ts` | `go/cli/program/devicesandvault/device.go` | `rust/cli/src/program/commands.json` | Also replace the recovery kit as part of the removal |
| `envden device rm -h, --help` | `apps/cli/src/commands/device/rm.ts` | `go/cli/program/devicesandvault/device.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden vault -h, --help` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden vault rotate -h, --help` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden vault kit -h, --help` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden vault kit replace --kit-out <file>` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/devicesandvault/vault.go` | `rust/cli/src/program/commands.json` | Write the new recovery kit as JSON to a private file instead of a PDF |
| `envden vault kit replace -h, --help` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden vault password -h, --help` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden vault password change -h, --help` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden vault password reset -h, --help` | `apps/cli/src/commands/vault/vault.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden server -h, --help` | `apps/cli/src/commands/server/server.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden server move --setup-token <token>` | `apps/cli/src/commands/server/move.ts` | `go/cli/program/getstarted/setup.go` | `rust/cli/src/program/commands.json` | Setup token, visible to other processes; use the prompt in a terminal |
| `envden server move --resume` | `apps/cli/src/commands/server/move.ts` | `go/cli/program/devicesandvault/move.go` | `rust/cli/src/program/commands.json` | Resume an interrupted move |
| `envden server move --abort` | `apps/cli/src/commands/server/move.ts` | `go/cli/program/devicesandvault/move.go` | `rust/cli/src/program/commands.json` | Abort an unfinished move |
| `envden server move -h, --help` | `apps/cli/src/commands/server/move.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden server switch -h, --help` | `apps/cli/src/commands/server/switch.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden server repair --repair-token <token>` | `apps/cli/src/commands/server/repair.ts` | `go/cli/program/devicesandvault/server.go` | `rust/cli/src/program/commands.json` | Repair token; prefer stdin for upload, use a terminal for --finish |
| `envden server repair --finish` | `apps/cli/src/commands/server/repair.ts` | `go/cli/program/devicesandvault/repair.go` | `rust/cli/src/program/commands.json` | Check every device's upload and finish the restore |
| `envden server repair --without <device...>` | `apps/cli/src/commands/server/repair.ts` | `go/cli/program/devicesandvault/repair.go` | `rust/cli/src/program/commands.json` | Drop unavailable devices; they rejoin as new devices |
| `envden server repair --accept-lost` | `apps/cli/src/commands/server/repair.ts` | `go/cli/program/devicesandvault/server.go` | `rust/cli/src/program/commands.json` | Accept the newest verified older version of a missing file |
| `envden server repair -h, --help` | `apps/cli/src/commands/server/repair.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden unlock -h, --help` | `apps/cli/src/commands/onboarding/unlock.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden config -h, --help` | `apps/cli/src/commands/maintenance/config.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden doctor --json` | `apps/cli/src/commands/maintenance/doctor.ts` | `go/cli/program/maintenance/doctor.go` | `rust/cli/src/program/commands.json` | Print the report as JSON |
| `envden doctor -h, --help` | `apps/cli/src/commands/maintenance/doctor.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden update --check` | `apps/cli/src/commands/maintenance/update.ts` | `go/cli/program/maintenance/update.go` | `rust/cli/src/program/commands.json` | Check for a release without installing |
| `envden update --post-install` | `apps/cli/src/commands/maintenance/update.ts` | `go/cli/program/maintenance/update.go` | `rust/cli/src/program/commands.json` | Refresh installed integrations |
| `envden update -h, --help` | `apps/cli/src/commands/maintenance/update.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden ui --port <port>` | `apps/cli/src/commands/ui/ui.ts` | `go/cli/program/maintenance/ui.go` | `rust/cli/src/program/commands.json` | Port on 127.0.0.1 (default: random) |
| `envden ui --no-open` | `apps/cli/src/commands/ui/ui.ts` | `go/cli/program/maintenance/ui.go` | `rust/cli/src/program/commands.json` | Print the link without opening a browser |
| `envden ui -h, --help` | `apps/cli/src/commands/ui/ui.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden agent -h, --help` | `apps/cli/src/commands/agent/agent.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden agent install -h, --help` | `apps/cli/src/commands/agent/install.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden shell -h, --help` | `apps/cli/src/commands/shell/shell.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden shell install -h, --help` | `apps/cli/src/commands/shell/shell.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden shell uninstall -h, --help` | `apps/cli/src/commands/shell/shell.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden serve --restored` | `apps/cli/src/commands/server/serve.ts` | `go/cli/program/maintenance/serve.go` | `rust/cli/src/program/commands.json` | Start a restored backup in repair-only mode |
| `envden serve --min-client <version>` | `apps/cli/src/commands/server/serve.ts` | `go/cli/program/maintenance/serve.go` | `rust/cli/src/program/commands.json` | Oldest client version to accept |
| `envden serve --data-dir <path>` | `apps/cli/src/commands/server/serve.ts` | `go/cli/program/maintenance/serve.go` | `rust/cli/src/program/commands.json` | Server data directory |
| `envden serve --port <port>` | `apps/cli/src/commands/server/serve.ts` | `go/cli/program/maintenance/serve.go` | `rust/cli/src/program/commands.json` | Localhost port |
| `envden serve -h, --help` | `apps/cli/src/commands/server/serve.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |
| `envden version -h, --help` | `apps/cli/src/commands/maintenance/version.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/commands.json` | Built-in help; exits 0. |

## Interactive prompts

34 rows.

| Item | TS (path) | Go (path or MISSING) | Rust (path or MISSING) | Note |
| --- | --- | --- | --- | --- |
| `Master password` | `apps/cli/src/onboarding/password.ts` | `go/cli/sync/command.go` | `rust/cli/src/sync/command.rs` | Setup/join/unlock, sync retry, config unlock-period, device removal, vault rotate/replace, move/switch/repair/rejoin. |
| `Confirm master password` | `apps/cli/src/onboarding/password.ts` | `go/cli/onboarding/password.go` | `rust/cli/src/onboarding/password.rs` | Setup and password change/reset. |
| `Old master password` | `apps/cli/src/commands/vault/run.ts` | `go/cli/program/devicesandvault/access_actions.go` | `rust/cli/src/commands/vault/run.rs` | Password change. |
| `Wrong master password. Try again` | `apps/cli/src/commands/onboarding/unlock.ts` | `go/cli/sync/command.go` | `rust/cli/src/sync/command.rs` | Unlock, switch and sync retry. |
| `Server address` | `apps/cli/src/onboarding/setup.ts` | `go/cli/onboarding/setup.go` | `rust/cli/src/onboarding/setup.rs` | Select server. |
| `Server setup token` | `apps/cli/src/output/prompts/token.ts` | `go/cli/onboarding/input.go` | `rust/cli/src/commands/server/token.rs` | Setup and move. |
| `Repair token` | `apps/cli/src/output/prompts/token.ts` | `go/cli/output/prompts/token.go` | `rust/cli/src/commands/server/token.rs` | Repair upload/finish. |
| `Device name` | `apps/cli/src/output/prompts/device-name.ts` | `go/cli/output/prompts/device_name.go` | `rust/cli/src/onboarding/setup.rs` | Setup and join. |
| `Recovery secret key` | `apps/cli/src/vault/recovery/read.ts` | `go/cli/vault/recovery/read.go` | `rust/cli/src/commands/vault/run.rs` | Recovery join and password change/reset. |
| `Vault ID` | `apps/cli/src/vault/recovery/read.ts` | `go/cli/vault/recovery/read.go` | `rust/cli/src/vault/recovery/read.rs` | Recovery join. |
| `Setup stopped after giving you a recovery kit. Do you still have it?` | `apps/cli/src/onboarding/setup.ts` | `go/cli/onboarding/setup.go` | `rust/cli/src/onboarding/vault/pending_kit.rs` | Resume creation. |
| `Secret key from that kit (EK1-…)` | `apps/cli/src/onboarding/setup.ts` | `go/cli/onboarding/setup.go` | `rust/cli/src/onboarding/vault/pending_kit.rs` | Resume creation proof. |
| `Enable anonymous telemetry?` | `apps/cli/src/onboarding/preferences.ts` | `go/cli/onboarding/preferences.go` | `rust/cli/src/onboarding/preferences.rs` | Preference. |
| `Check for updates daily?` | `apps/cli/src/onboarding/preferences.ts` | `go/cli/onboarding/preferences.go` | `rust/cli/src/onboarding/preferences.rs` | Preference. |
| `Install the shell notice? It prints a line when you cd into a checkout whose env files need a push or pull` | `apps/cli/src/output/prompts/questions.ts` | `go/cli/onboarding/preferences.go` | `rust/cli/src/output/prompts/choices.rs` | Choose zsh/bash/fish/PowerShell/none. |
| `Install the agent skill? It teaches AI coding agents like Claude Code and Codex to use envden safely` | `apps/cli/src/onboarding/preferences.ts` | `go/cli/onboarding/preferences.go` | `rust/cli/src/onboarding/preferences.rs` | Preference. |
| `Host the server on this machine? An always-on host is recommended.` | `apps/cli/src/onboarding/host/local.ts` | `go/cli/onboarding/host.go` | `rust/cli/src/onboarding/host/local.rs` | Local hosting. |
| `Sync env files for these checkouts?` | `apps/cli/src/onboarding/checkouts/choose.ts` | `go/cli/onboarding/checkouts/scan.go` | `rust/cli/src/onboarding/checkouts/choose.rs` | Multi-select checkout approval. |
| `${source} looks like a fork of ${target}. Share its env files with ${target}?` | `apps/cli/src/onboarding/scan.ts` | `go/cli/program/access/scan.go` | `rust/cli/src/onboarding/scan.rs` | Alias confirmation. |
| `Pairing code` | `apps/cli/src/pairing/prompt.ts` | `go/cli/onboarding/pairing.go` | `rust/cli/src/pairing/joiner.rs` | Pair existing device. |
| `Add ${proposed}?` | `apps/cli/src/onboarding/add.ts` | `go/cli/onboarding/add.go` | `rust/cli/src/pairing/approver.rs` | Approve joining device. |
| `This device held recovery keys. Replace the recovery kit in this removal?` | `apps/cli/src/commands/device/rm.ts` | `go/cli/program/devicesandvault/rm.go` | `rust/cli/src/vault/admin/removal.rs` | Removal exposure. |
| `Remove this device?` | `apps/cli/src/commands/device/rm.ts` | `go/cli/program/devicesandvault/rm.go` | `rust/cli/src/vault/admin/removal.rs` | Destructive confirmation. |
| `Replace the recovery kit now?` | `apps/cli/src/commands/server/repair.ts` | `go/cli/program/devicesandvault/repair.go` | `rust/cli/src/commands/server/repair.rs` | Repair finish. |
| `Saved the recovery kit?` | `apps/cli/src/vault/recovery/pdf/report.ts` | `go/cli/program/access/kit.go` | `rust/cli/src/vault/recovery/pdf/report.rs` | Offline kit acknowledgement. |
| `Open it now?` | `apps/cli/src/vault/recovery/pdf/report.ts` | `go/cli/program/access/kit.go` | `rust/cli/src/vault/recovery/pdf/report.rs` | Open saved PDF. |
| `Merge changes to ${keys.join(", ")}?` | `apps/cli/src/sync/command.ts` | `go/cli/sync/command.go` | `rust/cli/src/sync/command.rs` | Push/pull merge consent. |
| `${path} differs from the server's copy` | `apps/cli/src/output/prompts/questions.ts` | `go/cli/program/access/sync.go` | `rust/cli/src/output/prompts/choices.rs` | Keep mine / take server / merge. |
| `${path} differs from the synced copy` | `apps/cli/src/links/file.ts` | `go/cli/links/file.go` | `rust/cli/src/links/file/link.rs` | Initial link conflict. |
| `Let envden manage it? (target/checkout details)` | `apps/cli/src/links/takeover/group.ts` | `go/cli/links/takeover/group.go` | `rust/cli/src/links/takeover/group.rs` | Take over external symlink group. |
| `Run ${line}?` | `apps/cli/src/updates/self/execute.ts` | `go/cli/updates/self/execute.go` | `rust/cli/src/updates/self_update/execute.rs` | Package-manager update consent. |
| `This looks like an envden bug. Report it?` | `apps/cli/src/report/run.ts` | `go/cli/report/run.go` | `rust/cli/src/report/run.rs` | Harness, browser or no. |
| `Remove this env file everywhere and discard local edits and conflicts? All local content will be backed up.` | `apps/cli/src/sync/remove.ts` | `go/cli/sync/remove.go` | `rust/cli/src/sync/remove.rs` | rm confirmation. |
| `Restore ${path} to version ${version}? ${changesText(changes)}` | `apps/cli/src/history/restore/run.ts` | `go/cli/history/restore/run.go` | `rust/cli/src/history/restore/run.rs` | History restore confirmation. |

## Environment variables

59 rows.

| Item | TS (path) | Go (path or MISSING) | Rust (path or MISSING) | Note |
| --- | --- | --- | --- | --- |
| `AI_AGENT` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Suppress bug-report prompt. |
| `APPDATA` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `CLAUDECODE` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Suppress bug-report prompt. |
| `CLAUDE_CODE_ENTRYPOINT` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Suppress bug-report prompt. |
| `CODEX_CI` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Suppress bug-report prompt. |
| `CODEX_SANDBOX` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Suppress bug-report prompt. |
| `CODEX_SANDBOX_NETWORK_DISABLED` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Suppress bug-report prompt. |
| `CODEX_THREAD_ID` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Suppress bug-report prompt. |
| `COMSPEC` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/adapters/repo/git/src/parity.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `CURSOR_AGENT` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Suppress bug-report prompt. |
| `DO_NOT_TRACK` | `apps/cli/src/settings/privacy.ts` | `go/cli/settings/privacy.go` | `rust/cli/src/settings/render.rs` | Explicit environment read. |
| `E2E_KEEP` | `apps/cli/scripts/e2e.ts` | MISSING | MISSING | Developer-only TS e2e artifact retention; not a shipped port setting. |
| `ENVDEN_HOME` | `apps/cli/src/adapters.ts` | `go/cli/adapters.go` | `rust/cli/src/adapters.rs` | Explicit environment read. |
| `ENVDEN_INSTALL_METHOD` | `apps/cli/src/updates/install.ts` | `go/cli/updates/install.go` | `rust/cli/src/report/facts.rs` | Explicit environment read. |
| `ENVDEN_NO_REPORT` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Explicit environment read. |
| `ENVDEN_NO_UPDATE_CHECK` | `apps/cli/src/settings/privacy.ts` | `go/cli/settings/privacy.go` | `rust/cli/src/updates/check.rs` | Explicit environment read. |
| `ENVDEN_SETUP_TOKEN` | `apps/cli/src/commands/server/serve.ts` | `go/cli/program/maintenance/serve.go` | `rust/cli/src/commands/server/serve.rs` | Explicit environment read. |
| `ENVDEN_STATUS_PAGE` | `apps/server/src/status/state.ts` | `go/server/main.go` | `rust/server/src/lifecycle/serve.rs` | Explicit environment read. |
| `ENVDEN_TELEMETRY` | `apps/cli/src/settings/privacy.ts` | `go/cli/settings/privacy.go` | `rust/cli/src/main.rs` | Explicit environment read. |
| `ENVDEN_TELEMETRY_BODY` | `apps/cli/src/main.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/main.rs` | Internal child event payload. |
| `ENVDEN_TELEMETRY_KEY` | `apps/cli/scripts/build-all.ts` | `go/cli/settings/privacy.go` | `rust/cli/src/output/telemetry.rs` | Explicit environment read. |
| `FORCE_COLOR` | `apps/cli/src/output/prompts/questions.ts` | `go/cli/output/prompts/keys.go` | `rust/cli/src/output/prompts/terminal.rs` | Terminal dependency colour override. Dependency support has not been exercised. |
| `GEMINI_CLI` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Suppress bug-report prompt. |
| `HOME` | `apps/cli/src/updates/self/execute.ts` | `go/cli/adapters.go` | `rust/cli/src/home.rs` | Explicit environment read. |
| `HOMEDRIVE` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/cli/src/home.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `HOMEPATH` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/cli/src/home.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `HTTPS_PROXY` | `apps/cli/src/output/telemetry/background.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/output/telemetry.rs` | Forwarded to telemetry child; HTTP/TLS handling belongs to runtime. |
| `HTTP_PROXY` | `apps/cli/src/output/telemetry/background.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/output/telemetry.rs` | Forwarded to telemetry child; HTTP/TLS handling belongs to runtime. |
| `LANG` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `LC_*` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Case-insensitive locale prefix passed to trusted children. |
| `LOCALAPPDATA` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `LOGNAME` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `NEXT_PUBLIC_POSTHOG_KEY` | `apps/web/src/instrumentation-client.ts` | MISSING | MISSING | Next.js marketing site build/runtime setting; ports ship CLI/server only. |
| `NODE_EXTRA_CA_CERTS` | `apps/cli/src/output/telemetry/background.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/output/telemetry.rs` | Forwarded to telemetry child; HTTP/TLS handling belongs to runtime. |
| `NO_COLOR` | `apps/cli/src/output/prompts/questions.ts` | `go/cli/output/prompts/keys.go` | `rust/cli/src/output/prompts/terminal.rs` | Read by terminal dependencies, not application process.env. Dependency support has not been exercised. |
| `NO_PROXY` | `apps/cli/src/output/telemetry/background.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/output/telemetry.rs` | Forwarded to telemetry child; HTTP/TLS handling belongs to runtime. |
| `OPENCODE` | `apps/cli/src/report/offer.ts` | `go/cli/report/offer.go` | `rust/cli/src/report/offer.rs` | Suppress bug-report prompt. |
| `PATH` | `apps/cli/scripts/e2e.ts` | `go/core/process/environment.go` | `rust/cli/src/home.rs` | Explicit environment read. |
| `PATHEXT` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `PROGRAMDATA` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `PROGRAMFILES` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `PROGRAMFILES(X86)` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `SSL_CERT_FILE` | `apps/cli/src/output/telemetry/background.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/output/telemetry.rs` | Forwarded to telemetry child; HTTP/TLS handling belongs to runtime. |
| `SYSTEMDRIVE` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `SYSTEMROOT` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/adapters/repo/git/src/parity.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `TEMP` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/adapters/repo/git/src/parity.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `TERM` | `packages/core/src/process/environment.ts` | `go/server/main.go` | `rust/adapters/repo/git/src/exec.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `TMP` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/adapters/repo/git/src/parity.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `TMPDIR` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `USER` | `packages/core/src/process/environment.ts` | `go/cli/updates/self/execute.go` | `rust/cli/src/home.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `USERPROFILE` | `apps/cli/src/updates/self/execute.ts` | `go/cli/updates/self/execute.go` | `rust/cli/src/home.rs` | Explicit environment read. |
| `WINDIR` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/core/src/process/environment.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `XDG_CONFIG_HOME` | `packages/core/src/process/environment.ts` | `go/core/process/environment.go` | `rust/adapters/repo/git/src/exec.rs` | Trusted-child environment allowlist; PATH is rebuilt. |
| `http_proxy` | `apps/cli/src/output/telemetry/background.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/output/telemetry.rs` | Forwarded to telemetry child; HTTP/TLS handling belongs to runtime. |
| `https_proxy` | `apps/cli/src/output/telemetry/background.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/output/telemetry.rs` | Forwarded to telemetry child; HTTP/TLS handling belongs to runtime. |
| `no_proxy` | `apps/cli/src/output/telemetry/background.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/output/telemetry.rs` | Forwarded to telemetry child; HTTP/TLS handling belongs to runtime. |
| `node_extra_ca_certs` | `apps/cli/src/output/telemetry/background.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/output/telemetry.rs` | Forwarded to telemetry child; HTTP/TLS handling belongs to runtime. |
| `ssl_cert_file` | `apps/cli/src/output/telemetry/background.ts` | `go/cli/output/telemetry/background.go` | `rust/cli/src/output/telemetry.rs` | Forwarded to telemetry child; HTTP/TLS handling belongs to runtime. |
| `ENVDEN_RC_PATH` | `packages/adapters/shell/rc/src/files/windows.ts` | `go/adapters/shell/rc/stat_windows.go` | MISSING | Internal PowerShell ownership helper input; Rust uses native Windows ownership APIs instead of this variable. |

## Exit codes

26 rows.

| Item | TS (path) | Go (path or MISSING) | Rust (path or MISSING) | Note |
| --- | --- | --- | --- | --- |
| `INVALID_INPUT → 2` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` |  |
| `INVALID_DATA → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `UPDATE_REQUIRED → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `ROLLBACK → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `FORK → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `NOT_MEMBER → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `UNAUTHORIZED → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `LOCKED → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `RECOVERY_KIT_REQUIRED → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `STORAGE_QUOTA → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `RATE_LIMITED → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `CONFLICT → 3` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` |  |
| `NOT_FOUND → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `HEAD_MOVED → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `RESTORED_MODE → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `MOVING → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `SERVER_TOO_OLD → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `CLIENT_TOO_OLD → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `NOT_IMPLEMENTED → 2` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` |  |
| `INTERNAL → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `SERVER_UNREACHABLE → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `BUSY → 1` | `apps/cli/src/output/exit-code.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | TErrorCode; default 1. |
| `0` | `apps/cli/src/main.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | Success, help/version, graceful server signal shutdown. |
| `1` | `apps/cli/src/main.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | Unexpected errors; cancellation is INVALID_INPUT → 2. |
| `2` | `apps/cli/src/main.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | Commander parse/validation failure. |
| `3` | `apps/cli/src/main.ts` | `go/cli/output/errors.go` | `rust/cli/src/output/errors.rs` | Unresolved sync conflict. |

## HTTP routes

77 rows.

| Item | TS (path) | Go (path or MISSING) | Rust (path or MISSING) | Note |
| --- | --- | --- | --- | --- |
| `ui GET /api/status` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` |  |
| `ui HEAD /api/status` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `ui GET /api/devices` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` |  |
| `ui HEAD /api/devices` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `ui POST /api/pull` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` |  |
| `ui POST /api/push` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` |  |
| `ui POST /api/resolve` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` |  |
| `ui POST /api/devices/rename` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` |  |
| `ui GET /api/history` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` |  |
| `ui HEAD /api/history` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `ui POST /api/history/restore` | `apps/cli/src/ui/routes/api.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/routes/api.rs` |  |
| `ui GET *` | `apps/cli/src/ui/routes/page.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/server/app.rs` |  |
| `ui HEAD *` | `apps/cli/src/ui/routes/page.ts` | `go/cli/ui/start.go` | `rust/cli/src/ui/server/app.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/move/sk-pub` | `apps/server/src/move/metadata.ts` | `go/server/move_routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve HEAD /v1/move/sk-pub` | `apps/server/src/move/metadata.ts` | `go/server/move_routes.go` | `rust/server/src/routes/authenticated.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/move/period` | `apps/server/src/move/metadata.ts` | `go/server/move_routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve HEAD /v1/move/period` | `apps/server/src/move/metadata.ts` | `go/server/move_routes.go` | `rust/server/src/routes/authenticated.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /` | `apps/server/src/routes/status.ts` | `go/server/app.go` | `rust/server/src/lib.rs` |  |
| `serve HEAD /` | `apps/server/src/routes/status.ts` | `go/server/app.go` | `rust/server/src/lib.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/status` | `apps/server/src/routes/status.ts` | `go/server/app.go` | `rust/server/src/http/policy.rs` |  |
| `serve HEAD /v1/status` | `apps/server/src/routes/status.ts` | `go/server/app.go` | `rust/server/src/http/policy.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve POST /v1/pairing/mailboxes` | `apps/server/src/routes/pairing.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve GET /v1/pairing/mailboxes/:number/:slot` | `apps/server/src/routes/pairing.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve HEAD /v1/pairing/mailboxes/:number/:slot` | `apps/server/src/routes/pairing.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve PUT /v1/pairing/mailboxes/:number/:slot` | `apps/server/src/routes/pairing.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve DELETE /v1/pairing/mailboxes/:number` | `apps/server/src/routes/pairing.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve GET /v1/pairing/approver` | `apps/server/src/routes/pairing.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve HEAD /v1/pairing/approver` | `apps/server/src/routes/pairing.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/settings/unlock-period` | `apps/server/src/routes/settings.ts` | `go/server/routes.go` | `rust/server/src/routes/settings.rs` |  |
| `serve HEAD /v1/settings/unlock-period` | `apps/server/src/routes/settings.ts` | `go/server/routes.go` | `rust/server/src/routes/settings.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/unlock-window` | `apps/server/src/routes/settings.ts` | `go/server/routes.go` | `rust/server/src/routes/settings.rs` |  |
| `serve HEAD /v1/unlock-window` | `apps/server/src/routes/settings.ts` | `go/server/routes.go` | `rust/server/src/routes/settings.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve PUT /v1/settings/unlock-period` | `apps/server/src/routes/settings.ts` | `go/server/routes.go` | `rust/server/src/routes/settings.rs` |  |
| `serve POST /v1/opaque/login/start` | `apps/server/src/routes/opaque.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/opaque/login/finish` | `apps/server/src/routes/opaque.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/opaque/registration/start` | `apps/server/src/routes/opaque.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/opaque/registration/finish` | `apps/server/src/routes/opaque.ts` | `go/server/routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve GET /v1/hello` | `apps/server/src/routes/hello.ts` | `go/server/app.go` | `rust/server/src/http/policy.rs` |  |
| `serve HEAD /v1/hello` | `apps/server/src/routes/hello.ts` | `go/server/app.go` | `rust/server/src/http/policy.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/devices` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` |  |
| `serve HEAD /v1/devices` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/headers` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` |  |
| `serve HEAD /v1/headers` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/entries` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` |  |
| `serve HEAD /v1/entries` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/head` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` |  |
| `serve HEAD /v1/head` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/files/:hash` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` |  |
| `serve HEAD /v1/files/:hash` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/keyrings/:hash` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` |  |
| `serve HEAD /v1/keyrings/:hash` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/blobs/:hash` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` |  |
| `serve HEAD /v1/blobs/:hash` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/blobs` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` |  |
| `serve HEAD /v1/blobs` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve GET /v1/envelope` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` |  |
| `serve HEAD /v1/envelope` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve PUT /v1/blobs/:hash` | `apps/server/src/routes/data/reads.ts` | `go/server/reads.go` | `rust/server/src/routes/reads.rs` |  |
| `serve POST /v1/vault` | `apps/server/src/routes/data/vault.ts` | `go/server/data.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/swap` | `apps/server/src/routes/data/vault.ts` | `go/server/data.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/move/discard` | `apps/server/src/routes/data/recovery.ts` | `go/server/move_routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/move/session` | `apps/server/src/routes/data/recovery.ts` | `go/server/move_routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/move/freeze` | `apps/server/src/routes/data/recovery.ts` | `go/server/move_routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/move/unfreeze` | `apps/server/src/routes/data/recovery.ts` | `go/server/move_routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/repair/history` | `apps/server/src/routes/data/recovery.ts` | `go/server/import_routes.go` | `rust/server/src/repair/routes.rs` |  |
| `serve POST /v1/move/history` | `apps/server/src/routes/data/recovery.ts` | `go/server/import_routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/repair/chain` | `apps/server/src/routes/data/recovery.ts` | `go/server/import_routes.go` | `rust/server/src/repair/routes.rs` |  |
| `serve POST /v1/move/chain` | `apps/server/src/routes/data/recovery.ts` | `go/server/import_routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve POST /v1/repair/finish` | `apps/server/src/routes/data/recovery.ts` | `go/server/repair_routes.go` | `rust/server/src/repair/routes.rs` |  |
| `serve GET /v1/repair/status` | `apps/server/src/routes/data/recovery.ts` | `go/server/repair_routes.go` | `rust/server/src/repair/routes.rs` |  |
| `serve HEAD /v1/repair/status` | `apps/server/src/routes/data/recovery.ts` | `go/server/repair_routes.go` | `rust/server/src/repair/routes.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve PUT /v1/repair/report` | `apps/server/src/routes/data/recovery.ts` | `go/server/repair_routes.go` | `rust/server/src/repair/routes.rs` |  |
| `serve GET /v1/repair/reports` | `apps/server/src/routes/data/recovery.ts` | `go/server/repair_routes.go` | `rust/server/src/repair/routes.rs` |  |
| `serve HEAD /v1/repair/reports` | `apps/server/src/routes/data/recovery.ts` | `go/server/repair_routes.go` | `rust/server/src/repair/routes.rs` | B3: GET status/headers, no body; runtime Content-Length. |
| `serve PUT /v1/move/material/:kind/:hash` | `apps/server/src/routes/data/import.ts` | `go/server/import_routes.go` | `rust/server/src/routes/authenticated.rs` |  |
| `serve PUT /v1/repair/material/:kind/:hash` | `apps/server/src/routes/data/import.ts` | `go/server/import_routes.go` | `rust/server/src/repair/routes.rs` |  |
| `serve PUT /v1/move/period` | `apps/server/src/routes/data/import.ts` | `go/server/move_routes.go` | `rust/server/src/routes/authenticated.rs` |  |

## Wire messages and schemas

69 rows.

| Item | TS (path) | Go (path or MISSING) | Rust (path or MISSING) | Note |
| --- | --- | --- | --- | --- |
| `payloadCodec` | `packages/core/src/protocol/codecs/entry.ts` | `go/core/protocol/codecs/entry.go` | `rust/protocol/src/protocol/codecs/entry.rs` | Binary protocol codec. |
| `EntryCodec` | `packages/core/src/protocol/codecs/entry.ts` | `go/core/protocol/codecs/entry.go` | `rust/protocol/src/protocol/codecs/entry.rs` | Binary protocol codec. |
| `PairJoinerCodec` | `packages/core/src/protocol/codecs/pairing/joiner.ts` | `go/core/protocol/codecs/pairing/joiner.go` | `rust/protocol/src/protocol/codecs/pairing/joiner.rs` | Binary protocol codec. |
| `PairApproverCodec` | `packages/core/src/protocol/codecs/pairing/approver.ts` | `go/core/protocol/codecs/pairing/approver.go` | `rust/protocol/src/protocol/codecs/pairing/approver.rs` | Binary protocol codec. |
| `GenesisCodec` | `packages/core/src/protocol/codecs/entry-payloads/genesis.ts` | `go/core/protocol/codecs/entrypayloads/genesis.go` | `rust/protocol/src/protocol/codecs/entry_payloads/genesis.rs` | Binary protocol codec. |
| `ServerMovedCodec` | `packages/core/src/protocol/codecs/entry-payloads/server-moved.ts` | `go/core/protocol/codecs/entrypayloads/server_moved.go` | `rust/protocol/src/protocol/codecs/entry_payloads/server_moved.rs` | Binary protocol codec. |
| `RenameDeviceCodec` | `packages/core/src/protocol/codecs/entry-payloads/rename-device.ts` | `go/core/protocol/codecs/entrypayloads/rename_device.go` | `rust/protocol/src/protocol/codecs/entry_payloads/rename_device.rs` | Binary protocol codec. |
| `RemoveDeviceCodec` | `packages/core/src/protocol/codecs/entry-payloads/remove-device.ts` | `go/core/protocol/codecs/entrypayloads/remove_device.go` | `rust/protocol/src/protocol/codecs/entry_payloads/remove_device.rs` | Binary protocol codec. |
| `AddDeviceCodec` | `packages/core/src/protocol/codecs/entry-payloads/add-device.ts` | `go/core/protocol/codecs/entrypayloads/add_device.go` | `rust/protocol/src/protocol/codecs/entry_payloads/add_device.rs` | Binary protocol codec. |
| `RepairDoneCodec` | `packages/core/src/protocol/codecs/entry-payloads/repair-done.ts` | `go/core/protocol/codecs/entrypayloads/repair_done.go` | `rust/protocol/src/protocol/codecs/entry_payloads/repair_done.rs` | Binary protocol codec. |
| `ReplaceRecoveryCodec` | `packages/core/src/protocol/codecs/entry-payloads/replace-recovery.ts` | `go/core/protocol/codecs/entrypayloads/replace_recovery.go` | `rust/protocol/src/protocol/codecs/entry_payloads/replace_recovery.rs` | Binary protocol codec. |
| `NewEpochCodec` | `packages/core/src/protocol/codecs/entry-payloads/new-epoch.ts` | `go/core/protocol/codecs/entrypayloads/new_epoch.go` | `rust/protocol/src/protocol/codecs/entry_payloads/new_epoch.rs` | Binary protocol codec. |
| `EnvelopeCodec` | `packages/core/src/protocol/codecs/content/envelope.ts` | `go/core/protocol/codecs/content/envelope.go` | `rust/protocol/src/protocol/codecs/content/envelope.rs` | Binary protocol codec. |
| `FileNameCodec` | `packages/core/src/protocol/codecs/content/file-name.ts` | `go/core/protocol/codecs/content/file_name.go` | `rust/protocol/src/protocol/codecs/content/file_name.rs` | Binary protocol codec. |
| `FileCodec` | `packages/core/src/protocol/codecs/content/file.ts` | `go/core/protocol/codecs/content/file.go` | `rust/protocol/src/protocol/codecs/content/file.rs` | Binary protocol codec. |
| `PendingResponseSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `DevicesResponseSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `ObjectsResponseSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `CommitResponseSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `RepairStatusSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `TransferResponseSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `RepairFinishSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `ErrorResponseSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `UnlockWindowSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `LoginFinishResponseSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `RegistrationResponseSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `MailboxClosedSchema` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Zod acceptance/response type. |
| `StatusResponseSchema` | `packages/core/src/protocol/codecs/server/status.ts` | `go/core/protocol/codecs/server/status.go` | `rust/protocol/src/protocol/codecs/server/status.rs` | Zod acceptance/response type. |
| `LoginStartSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `LoginFinishSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `RegistrationStartSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `RegistrationFinishSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `UnlockPeriodSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `MailboxSlotSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `MailboxWriteSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `MessageResponseSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `HelloResponseSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `MailboxOpenedSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `MailboxSlotResponseSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `MailboxWriteResponseSchema` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Zod acceptance/response type. |
| `RequestCodec` | `packages/core/src/protocol/codecs/server/request.ts` | `go/core/protocol/codecs/server/request.go` | `rust/protocol/src/protocol/codecs/server/request.rs` | Binary protocol codec. |
| `RepairReportCodec` | `packages/core/src/protocol/codecs/server/repair-report.ts` | `go/core/protocol/codecs/server/repair_report.go` | `rust/protocol/src/protocol/codecs/server/repair_report.rs` | Binary protocol codec. |
| `ServerHelloCodec` | `packages/core/src/protocol/codecs/server/hello.ts` | `go/core/protocol/codecs/server/hello.go` | `rust/protocol/src/protocol/codecs/server/hello.rs` | Binary protocol codec. |
| `WrapCodec` | `packages/core/src/protocol/codecs/epochs/wrap.ts` | `go/core/protocol/codecs/epochs/wrap.go` | `rust/protocol/src/protocol/codecs/epochs/wrap.rs` | Binary protocol codec. |
| `EpochChangeCodec` | `packages/core/src/protocol/codecs/epochs/epoch-change.ts` | `go/core/protocol/codecs/epochs/epoch_change.go` | `rust/protocol/src/protocol/codecs/epochs/epoch_change.rs` | Binary protocol codec. |
| `KeyringCodec` | `packages/core/src/protocol/codecs/epochs/keyring.ts` | `go/core/protocol/codecs/epochs/keyring.go` | `rust/protocol/src/protocol/codecs/epochs/keyring.rs` | Binary protocol codec. |
| `OlderKeyCodec` | `packages/core/src/protocol/codecs/epochs/older-key.ts` | `go/core/protocol/codecs/epochs/older_key.go` | `rust/protocol/src/protocol/codecs/epochs/older_key.rs` | Binary protocol codec. |
| `DeviceRecordCodec` | `packages/core/src/protocol/codecs/members/device.ts` | `go/core/protocol/codecs/members/device.go` | `rust/protocol/src/protocol/codecs/members/device.rs` | Binary protocol codec. |
| `RecoveryRecordCodec` | `packages/core/src/protocol/codecs/members/recovery.ts` | `go/core/protocol/codecs/members/recovery.go` | `rust/protocol/src/protocol/codecs/members/recovery.rs` | Binary protocol codec. |
| `SwapCodec` | `packages/core/src/protocol/codecs/manifests/swap.ts` | `go/core/protocol/codecs/manifests/swap.go` | `rust/protocol/src/protocol/codecs/manifests/swap.rs` | Binary protocol codec. |
| `ManifestHeaderCodec` | `packages/core/src/protocol/codecs/manifests/header.ts` | `go/core/protocol/codecs/manifests/header.go` | `rust/protocol/src/protocol/codecs/manifests/header.rs` | Binary protocol codec. |
| `FileEntryCodec` | `packages/core/src/protocol/codecs/manifests/file-entry.ts` | `go/core/protocol/codecs/manifests/file_entry.go` | `rust/protocol/src/protocol/codecs/manifests/file_entry.rs` | Binary protocol codec. |
| `FilesCodec` | `packages/core/src/protocol/codecs/manifests/files.ts` | `go/core/protocol/codecs/manifests/files.go` | `rust/protocol/src/protocol/codecs/manifests/files.rs` | Binary protocol codec. |
| `message(length)` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | OPAQUE base64url length checks. |
| `binary(bytes), id, object` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Base64url character/size bounds; id 32 bytes, object 3,200,182 bytes. |
| `DevicesResponseSchema.devices[]` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Strict {id, clientVersion, confirmed}. |
| `CommitResponseSchema.committed` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Strict committed tag. |
| `CommitResponseSchema.retry-of-committed` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Strict retry tag. |
| `CommitResponseSchema.head-moved` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Strict tag and optional head. |
| `MailboxSlotResponseSchema.message` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Strict message and expiry. |
| `MailboxSlotResponseSchema.pending` | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/http.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | Strict pending and expiry. |
| `RepairFinishSchema.login` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | LoginFinish extended with kind, unlock purpose and swap. |
| `RepairFinishSchema.registration` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | RegistrationFinish extended with kind and swap. |
| `LoginFinishResponseSchema.ticket` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Strict ticket tag. |
| `LoginFinishResponseSchema.staged` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | Strict staged tag. |
| `LoginFinishResponseSchema.unlocked` | `packages/core/src/protocol/codecs/server/data.ts` | `go/core/protocol/codecs/server/data.go` | `rust/protocol/src/protocol/codecs/server/data.rs` | UnlockWindow extended with unlocked tag. |
| `StatusResponseSchema.lastPrune` | `packages/core/src/protocol/codecs/server/status.ts` | `go/core/protocol/codecs/server/status.go` | `rust/protocol/src/protocol/codecs/server/status.rs` | Strict nullable {at: ISO datetime, ok: boolean}. |
| `count` | `packages/core/src/protocol/codecs/server/status.ts` | `go/core/protocol/codecs/server/status.go` | `rust/protocol/src/protocol/codecs/server/status.rs` | Nonnegative integer status counters. |
| `signedCodec<T>` | `packages/core/src/protocol/codecs/signed.ts` | `go/core/protocol/codecs/signed.go` | `rust/protocol/src/protocol/codecs/signed.rs` | Signature wrapper around binary codec. |

## Files and state formats

82 rows.

| Item | TS (path) | Go (path or MISSING) | Rust (path or MISSING) | Note |
| --- | --- | --- | --- | --- |
| `H/config.json` | `apps/cli/src/settings/config.ts` | `go/cli/settings/config.go` | `rust/cli/src/settings/config.rs` | JSON settings; Zod-validated. |
| `H/state/device.json` | `apps/cli/src/state/store/repository.ts` | `go/cli/state/store/repository.go` | `rust/cli/src/state/repository.rs` | format:1 JSON; $map/$set/$bigint/$bytes tagged values; headerRefs. |
| `H/state/headers/<sha256-hex>` | `apps/cli/src/state/store/headers.ts` | `go/cli/state/store/repository.go` | `rust/cli/src/state/repository.rs` | Base64url signed manifest header text; hash addresses the text. |
| `H/state/placement.json` | `apps/cli/src/state/journal/placement.ts` | `go/cli/state/journal/placement.go` | `rust/cli/src/state/journal.rs` | JSON placement recovery journal. |
| `H/state/write.lock/owner.json` | `apps/cli/src/state/lock/publish.ts` | `go/cli/state/lock/owner.go` | `rust/cli/src/state/lock/publication.rs` | JSON process identity and ownership token. |
| `H/state/write.lock/.<token>.tmp` | `apps/cli/src/state/lock/publish.ts` | `go/cli/state/lock/owner.go` | `rust/cli/src/state/lock/publication.rs` | Temporary JSON owner publication; hard-linked. |
| `H/state/write.lock/reclaim; H/state/write.lock.<uuid>.abandoned` | `apps/cli/src/state/lock/reclaim.ts` | `go/cli/state/lock/owner.go` | `rust/cli/src/state/lock/mod.rs` | Reclamation guard / renamed lock directory. |
| `H/state/applied-files.json` | `apps/cli/src/sync/local/applied.ts` | `go/cli/sync/local/applied.go` | `rust/cli/src/sync/local/applied.rs` | JSON file-id → base64url entry receipt. |
| `H/state/attempts/<receipt>` | `apps/cli/src/sync/remote/attempt/record.ts` | `go/cli/sync/remote/attempt/record.go` | `rust/cli/src/sync/remote/attempt/record/state.rs` | JSON pending commit receipt. |
| `H/state/keys/<sha256(name)-hex>.key` | `packages/adapters/keychain/file/src/adapter.ts` | `go/adapters/keychain/file/adapter.go` | `rust/adapters/keychain/file/src/adapter.rs` | Raw private key/session bytes; keychain names hashed. |
| `H/state/file-lists/<hash>` | `apps/cli/src/sync/remote/content.ts` | `go/cli/sync/remote/accept.go` | `rust/cli/src/sync/remote/accept.rs` | Binary authenticated encrypted file-list object cache. |
| `H/state/blobs/<hash>` | `apps/cli/src/sync/remote/seal.ts` | `go/cli/sync/remote/seal.go` | `rust/cli/src/sync/remote/upload/seal.rs` | Binary encrypted blob cache. |
| `H/state/pair-pin` | `apps/cli/src/onboarding/join/pairing.ts` | `go/cli/onboarding/pairing.go` | `rust/cli/src/pairing/joiner.rs` | Server pin text. |
| `H/state/pair-swap` | `apps/cli/src/pairing/persistence/submission.ts` | `go/cli/pairing/persistence/submission.go` | `rust/cli/src/pairing/persistence.rs` | mailbox:base64url swap text. |
| `H/state/kit-join` | `apps/cli/src/vault/recovery/attempt.ts` | `go/cli/vault/recovery/attempt.go` | `rust/cli/src/onboarding/join.rs` | JSON {vaultId, pin, name}; no recovery secret stored. |
| `H/state/kit-replace` | `apps/cli/src/admin/recovery/pending.ts` | `go/cli/admin/recovery/pending.go` | `rust/cli/src/vault/admin/pending.rs` | Base64url pending kit-replacement swap. |
| `H/state/move-address` | `apps/cli/src/admin/move/run.ts` | `go/cli/admin/move/run.go` | `rust/cli/src/admin/move/run.rs` | Destination URL text. |
| `H/state/move-pin` | `apps/cli/src/admin/move/run.ts` | `go/cli/admin/move/run.go` | `rust/cli/src/admin/move/run.rs` | Base64url destination pin. |
| `H/state/move-swap.bin` | `apps/cli/src/admin/move/run.ts` | `go/cli/admin/move/run.go` | `rust/cli/src/admin/move/run.rs` | Binary SwapCodec. |
| `H/state/repair-close` | `apps/cli/src/admin/repair/resume.ts` | `go/cli/admin/repair/resume.go` | `rust/cli/src/admin/repair/resume.rs` | Base64url pending repair swap. |
| `H/state/repair-restored-<repair-id>` | `apps/cli/src/admin/repair/upload.ts` | `go/cli/admin/repair/upload.go` | `rust/cli/src/admin/repair/upload.rs` | Base64url restored manifest hash. |
| `H/state/repair-report-<repair-id>` | `apps/cli/src/admin/repair/lost.ts` | `go/cli/admin/repair/lost.go` | `rust/cli/src/admin/repair/resume.rs` | Human-readable loss report text. |
| `H/state/approved-checkouts` | `apps/cli/src/notice/cache.ts` | `go/cli/notice/cache.go` | `rust/cli/src/notice/cache.rs` | Newline-separated absolute roots. |
| `H/state/approved-checkouts-insensitive` | `apps/cli/src/notice/cache.ts` | `go/cli/notice/cache.go` | `rust/cli/src/notice/cache.rs` | Newline-separated case-insensitive roots. |
| `H/state/notice` | `apps/cli/src/notice/cache.ts` | `go/cli/notice/cache.go` | `rust/cli/src/notice/cache.rs` | Terminal-safe newline-separated sync notices. |
| `H/state/notice-update` | `apps/cli/src/notice/offers.ts` | `go/cli/notice/offers.go` | `rust/cli/src/notice/offers.rs` | Newline-separated update notices. |
| `H/state/track-offers` | `apps/cli/src/notice/offers.ts` | `go/cli/notice/offers.go` | `rust/cli/src/notice/offers.rs` | Newline-separated roots awaiting approval. |
| `H/state/track-scanned.json` | `apps/cli/src/notice/offers.ts` | `go/cli/notice/offers.go` | `rust/cli/src/notice/offers.rs` | JSON root → scan timestamp. |
| `H/state/remote-notice.json` | `apps/cli/src/notice/remote.ts` | `go/cli/notice/remote.go` | `rust/cli/src/notice/remote.rs` | JSON remote-notice cache. |
| `H/state/pending-recovery.json` | `apps/cli/src/notice/pending.ts` | `go/cli/notice/pending.go` | `rust/cli/src/notice/pending.rs` | JSON pending recovery notice; cleared to {}. |
| `H/state/pending-repairs.json` | `apps/cli/src/sync/remote/repairs.ts` | `go/cli/sync/remote/repairs.go` | `rust/cli/src/sync/remote/repairs.rs` | JSON repair-ID array. |
| `H/state/recovery-notice` | `apps/cli/src/notice/recovery.ts` | `go/cli/notice/pending.go` | `rust/cli/src/notice/pending.rs` | JSON seen-recovery ID array. |
| `H/state/updates.json` | `apps/cli/src/updates/cache.ts` | `go/cli/updates/cache.go` | `rust/cli/src/updates/cache.rs` | JSON release-check cache. |
| `H/state/update-required` | `apps/cli/src/updates/status.ts` | `go/cli/updates/status.go` | `rust/cli/src/updates/status.rs` | CLI version text. |
| `H/state/install-id` | `apps/cli/src/output/telemetry/report.ts` | `go/cli/output/telemetry/report.go` | `rust/cli/src/output/telemetry.rs` | UUID text. |
| `H/store/<base32 H(local-repo, repo-id)>/<relative-env-path>` | `apps/cli/src/store/path.ts` | `go/cli/store/path.go` | `rust/cli/src/store.rs` | Plain env bytes. |
| `H/base/<base32 SHA256(store[+NUL+copy-root])>` | `apps/cli/src/sync/local/files.ts` | `go/cli/sync/local/files/files.go` | `rust/cli/src/sync/local/files.rs` | Plain merge-base env bytes. |
| `H/base/<id>.entry` | `apps/cli/src/sync/local/applied.ts` | `go/cli/sync/local/applied.go` | `rust/cli/src/sync/local/applied.rs` | Base64url applied entry. |
| `H/base/<id>.corrupt` | `apps/cli/src/sync/remote/attempt/state.ts` | `go/cli/sync/remote/attempt/state/state.go` | `rust/cli/src/sync/remote/attempt/record/state.rs` | Corrupt receipt marker/path text. |
| `H/conflicts/<base32 SHA256(base-path)> (merged file)` | `apps/cli/src/sync/local/conflicts.ts` | `go/cli/sync/local/conflicts.go` | `rust/cli/src/sync/local/conflicts.rs` | Plain merged env bytes with conflict markers. |
| `H/conflicts/<base32 SHA256(base-path)>.server` | `apps/cli/src/sync/local/conflicts.ts` | `go/cli/sync/local/conflicts.go` | `rust/cli/src/sync/local/conflicts.rs` | Plain server side. |
| `H/conflicts/<base32 SHA256(base-path)>.mine` | `apps/cli/src/sync/local/conflicts.ts` | `go/cli/sync/local/conflicts.go` | `rust/cli/src/sync/local/conflicts.rs` | Plain local side. |
| `H/conflicts/<base32 SHA256(base-path)>.remote` | `apps/cli/src/sync/local/conflicts.ts` | `go/cli/sync/local/conflicts.go` | `rust/cli/src/sync/local/conflicts.rs` | Plain second merge variant. |
| `H/conflicts/<base32 SHA256(base-path)>.variant-<index>` | `apps/cli/src/sync/local/conflicts.ts` | `go/cli/sync/local/conflicts.go` | `rust/cli/src/sync/local/conflicts.rs` | Plain additional variants. |
| `H/conflicts/backups/<13-digit-ms>_<uuid>` | `apps/cli/src/sync/local/conflicts.ts` | `go/cli/sync/local/conflicts.go` | `rust/cli/src/sync/local/conflicts.rs` | Plain retained conflict/removal data. |
| `H/conflicts/.envden-backup-<ms>-<uuid>` | `packages/adapters/placement/fs/src/backups/write.ts` | `go/adapters/placement/fs/backups.go` | `rust/adapters/placement/fs/src/backup.rs` | Private original file bytes from placement. |
| `H/reports/<ISO-time-with-colons-and-dots-replaced>.md` | `apps/cli/src/report/write.ts` | `go/cli/report/write.go` | `rust/cli/src/report/write.rs` | Redacted Markdown bug report. |
| `H/server.log` | `apps/cli/src/agent/service/install.ts` | `go/cli/host/install.go` | `rust/cli/src/agent/service/install.rs` | Service stdout/stderr text. |
| `D/identity.json` | `apps/server/src/identity/keys.ts` | `go/server/identity/keys.go` | `rust/server/src/identity/keys.rs` | JSON persistent server signing identity. |
| `D/envden.sqlite` | `packages/adapters/storage/sqlite/src/db/schema.ts` | `go/adapters/storage/sqlite/adapter.go` | `rust/adapters/storage/sqlite/src/db/schema.rs` | SQLite v1 schema; ciphertext, auth/rate/repair state. |
| `D/envden.sqlite-wal` | `packages/adapters/storage/sqlite/src/db/schema.ts` | `go/adapters/storage/sqlite/adapter.go` | `rust/adapters/storage/sqlite/src/db/schema.rs` | SQLite WAL while running; removed on clean close (B20). |
| `D/envden.sqlite-shm` | `packages/adapters/storage/sqlite/src/db/schema.ts` | `go/adapters/storage/sqlite/adapter.go` | `rust/adapters/storage/sqlite/src/db/schema.rs` | SQLite shared memory while running; removed on clean close (B20). |
| `D/blobs/<vault-id-hex>/<hash-hex>` | `packages/adapters/storage/sqlite/src/blobs/blobs.ts` | `go/adapters/storage/sqlite/blobs.go` | `rust/adapters/storage/sqlite/src/blobs/objects.rs` | Binary encrypted content-addressed objects. |
| `U/Downloads/envden Recovery Kit <first-six-vault-id>[ (<copy>)].pdf (fallback U)` | `apps/cli/src/vault/recovery/pdf/save.ts` | `go/cli/vault/recovery/pdf/save.go` | `rust/cli/src/vault/recovery/pdf/save.rs` | Recovery PDF; exclusive create. |
| `<--kit-out>` | `apps/cli/src/vault/recovery/output.ts` | `go/cli/vault/recovery/output.go` | `rust/cli/src/vault/recovery/output.rs` | Pretty JSON recovery kit; exclusive private create. |
| `U/.agents/skills/envden/SKILL.md` | `apps/cli/src/agent/install.ts` | `go/cli/agent/install.go` | `rust/cli/src/agent/install.rs` | Bundled skill Markdown. |
| `U/.claude/skills/envden` | `apps/cli/src/agent/install.ts` | `go/cli/agent/install.go` | `rust/cli/src/agent/install.rs` | Symlink to shared agent skill. |
| `U/Library/LaunchAgents/com.envden.server.plist` | `apps/cli/src/agent/service/location.ts` | `go/cli/host/install.go` | `rust/cli/src/agent/service/location.rs` | launchd XML. |
| `U/.config/systemd/user/envden.service` | `apps/cli/src/agent/service/location.ts` | `go/cli/host/install.go` | `rust/cli/src/agent/service/install.rs` | systemd unit text. |
| `H/envden-task.xml` | `apps/cli/src/agent/service/location.ts` | `go/cli/host/install.go` | `rust/cli/src/agent/service/location.rs` | Windows Task Scheduler UTF-16LE XML. |
| `U/.zshrc` | `packages/adapters/shell/rc/src/adapter.ts` | `go/adapters/shell/rc/adapter.go` | `rust/adapters/shell/rc/src/profile.rs` | Preserved profile bytes plus managed notice block. |
| `U/.bashrc / .bash_profile / .bash_login / .profile` | `packages/adapters/shell/rc/src/files/bash-profile.ts` | `go/adapters/shell/rc/profile.go` | `rust/adapters/shell/rc/src/profile.rs` | Preserved profile bytes plus managed notice block. macOS selects the existing login profile or sourced .bashrc. |
| `U/.config/fish/config.fish` | `packages/adapters/shell/rc/src/adapter.ts` | `go/adapters/shell/rc/adapter.go` | `rust/adapters/shell/rc/src/profile.rs` | Preserved profile bytes plus managed notice block. |
| `U/Documents/PowerShell/Microsoft.PowerShell_profile.ps1 (Windows); U/.config/powershell/Microsoft.PowerShell_profile.ps1 (Unix); resolved $PROFILE override` | `packages/adapters/shell/rc/src/adapter.ts` | `go/adapters/shell/rc/adapter.go` | `rust/adapters/shell/rc/src/profile.rs` | Preserved profile bytes plus managed notice block. |
| `H/conflicts/.envden-backup-<uuid>` | `packages/adapters/shell/rc/src/files/backup.ts` | `go/adapters/shell/rc/backup.go` | `rust/adapters/shell/rc/src/edit_files.rs` | Private original shell profile bytes. |
| `<checkout>/.git/info/exclude (common git dir)` | `packages/adapters/repo/git/src/ignore/ensure-ignored.ts` | `go/adapters/repo/git/ignore.go` | `rust/adapters/repo/git/src/ignore.rs` | Appended ignore rule for managed env files. |
| `<checkout>/<env-path>` | `packages/adapters/placement/fs/src/operations/place.ts` | `go/adapters/placement/fs/adapter.go` | `rust/adapters/placement/fs/src/place.rs` | Managed symlink or real copy; original link restored on untrack. |
| `<checkout>/.envden-probe-<id>` | `packages/adapters/placement/fs/src/operations/supported.ts` | `go/adapters/placement/fs/common.go` | `rust/adapters/placement/fs/src/adapter.rs` | Temporary symlink support probe. |
| `<checkout>/.envden-case-<id>` | `packages/adapters/repo/git/src/checkout/case.ts` | `go/adapters/repo/git/case.go` | `rust/adapters/repo/git/src/case.rs` | Temporary case-sensitivity probe. |
| `<binary>.envden-old; <binary>.envden-new[.exe]` | `apps/cli/src/updates/replace.ts` | `go/cli/updates/replace.go` | `rust/cli/src/updates/self_update/replace.rs` | Previous executable and staged replacement. |
| `<temp>/envden-manager-<id>/npmrc` | `apps/cli/src/updates/self/execute.ts` | `go/cli/updates/self/execute.go` | `rust/cli/src/updates/self_update/execute.rs` | Empty isolated npm config; removed after update. |
| `<target-directory>/.<13-digit-ms>_<uuid>.tmp` | `apps/cli/src/state/store/files.ts` | `go/cli/state/files/files.go` | `rust/cli/src/state/files.rs` | Private temporary bytes then rename; identity/keychain/placement/shell have dedicated staging names. |
| `<sync-record>.corrupt-<13-digit-ms>_<uuid>; <base>.corrupt` | `apps/cli/src/state/store/records.ts` | `go/cli/state/records/records.go` | `rust/cli/src/state/records.rs` | Retained unreadable record and marker naming its backup. |
| `H/state/conflicts.json` | `apps/cli/src/sync/local/conflicts.ts` | `go/cli/sync/local/conflicts.go` | `rust/cli/src/sync/local/conflicts.rs` | JSON {model:"shared-store", records}; strict conflict records. |
| `D/.identity-<uuid>` | `apps/server/src/identity/persist.ts` | `go/server/identity/keys.go` | `rust/server/src/identity/persist.rs` | Temporary JSON before exclusive identity publication. |
| `H/state/keys/<uuid>.tmp` | `packages/adapters/keychain/file/src/files/source.ts` | `go/adapters/keychain/file/adapter.go` | `rust/adapters/keychain/file/src/files.rs` | Temporary raw key bytes. |
| `<profile-directory>/.envden-rc-<uuid>` | `packages/adapters/shell/rc/src/files/edit.ts` | `go/adapters/shell/rc/edit.go` | `rust/adapters/shell/rc/src/edit.rs` | Temporary preserved profile bytes. |
| `<checkout>/<env-directory>/.envden-<sha256(relative-path)-hex>` | `packages/adapters/placement/fs/src/paths/temporary.ts` | `go/adapters/placement/fs/adapter.go` | `rust/adapters/placement/fs/src/place.rs` | Placement staging symlink/copy; exclude added before use. |
| `H/state/pair-expiry` | `apps/cli/src/pairing/prompt.ts` | `go/cli/onboarding/pairing.go` | `rust/cli/src/pairing/joiner.rs` | Decimal expiry timestamp text. |
| `H/state/pair-joiner` | `apps/cli/src/pairing/joiner.ts` | `go/cli/pairing/joiner.go` | `rust/cli/src/pairing/persistence.rs` | JSON {mailbox, ke3, message}; pairing resume. |
| `H/base/<id>.pending` | `apps/cli/src/sync/local/reconciliation/operation/file.ts` | `go/cli/sync/local/reconciliation/operation/file.go` | `rust/cli/src/sync/local/reconciliation/operation/record.rs` | JSON staged reconciliation operation, targets, before/after bytes, entry and progress. |
| `H/base/<id>.delete` | `apps/cli/src/sync/local/reconciliation/operation/deletion.ts` | `go/cli/sync/local/reconciliation/operation/deletion.go` | `rust/cli/src/sync/local/reconciliation/operation/deletion.rs` | JSON {entry, targets}; deletion receipt. |

## Remaining differences

These are the accepted differences recorded in the port notes unless marked open. They do not excuse a missing command, changed exit code or different authorization decision.

| Item | TS (path) | Go (path or MISSING) | Rust (path or MISSING) | Note |
| --- | --- | --- | --- | --- |
| Help layout | `apps/cli/src/program.ts` | `go/cli/program/command/help.go` | `rust/cli/src/program/help.rs` | Commander, Cobra and clap own headings, wrapping and spacing. |
| Parser diagnostics/suggestions | `apps/cli/src/output/sanitize.ts` | `go/cli/program/command/execute.go` | `rust/cli/src/program/errors.rs` | Go prints no “Did you mean” line; Rust uses clap's diagnostics/suggestions. All depths sanitize echoed arguments and preserve diagnostic line breaks. |
| Prompt rendering | `apps/cli/src/output/prompts/questions.ts` | `go/cli/output/prompts/session.go` | `rust/cli/src/output/prompts/render.rs` | Clack, huh/Bubble Tea and CliClack draw different frames/masks. Rust prompt frames/notices go to stderr; TS uses stdout. |
| Prompt keystrokes | `apps/cli/src/output/prompts/questions.ts` | `go/cli/output/prompts/session.go` | `rust/cli/src/output/prompts/terminal.rs` | Go: Tab submits; y/n, arrows, h/l and Space answer confirmations; x/Space toggle checkouts. Rust: Ctrl-U clears the line; readline kill/history keys differ, lists stop at ends, Space does not toggle confirm, checkbox select-all/invert keys differ. Enter/Ctrl-C/Ctrl-D/Escape outcomes match; editing, paste and typed-ahead mechanics remain library-owned. |
| Scan spinner | `apps/cli/src/onboarding/scan.ts` | `go/cli/program/access/scan.go` | `rust/cli/src/onboarding/scan.rs` | Animation/frames differ; Rust uses CliClack/indicatif. Found counts and discovery decisions remain visible and unchanged. |
| Recovery PDF serialization | `apps/cli/src/vault/recovery/pdf/layout.ts` | `go/cli/vault/recovery/pdf/save.go` | `rust/cli/src/vault/recovery/pdf/save.rs` | pdf-lib, Go's PDF writer and lopdf/flate2 produce different compressed streams/object layouts. Rust metadata/resource names differ. Kit fields, exclusive creation, permissions and file placement remain shared requirements. |
| Status-page sizes | `apps/server/src/status/page/format.ts` | `go/server/status/page.go` | `rust/server/src/status/page/bytes.rs` | TS pretty-bytes; Go go-humanize; Rust humansize (binary units, two fractional decimals). Rust displays 1048575 as 1024.00 KiB, TS as 1 MiB. JSON byte counts are unchanged. |
| Status-page elapsed text | `apps/server/src/status/page/format.ts` | `go/server/status/page.go` | `rust/server/src/status/page/when.rs` | Date/elapsed presentation is library-owned. Rust last-prune uses chrono-humanize with commas/and. Uptime counts total days, hours and minutes in all implementations (B5); no month/year truncation. |
| Unicode normalization | `packages/core/src/protocol/encoding/strings.ts` | `go/core/protocol/encoding/strings.go` | `rust/protocol/src/protocol/encoding/strings.rs` | Bun ICU 17 versus Go x/text Unicode 15: 57 normalization scalars differ. Rust locks unicode-normalization 0.1.26, whose table declares Unicode 18.0.0; it must not be described as Unicode 17. No Rust-versus-Bun scalar sweep was run here. |
| Unicode case/category/collation | `packages/core/src/adapters/env/files.ts` | `go/core/protocol/encoding/strings.go` | `rust/cli/src/sync/local/validation/collisions.rs` | Go notes report 110 case scalars different from Bun ICU 17. Rust uses standard-library case mapping (toolchain pinned 1.98.1), unicode-general-category 1.1.0 (Unicode 16.0.0), and icu_collator/icu_collator_data 2.4.0. The exact standard-library/ICU data table versions and resulting scalar differences were not established here. |
| Runtime/OS error text | `apps/cli/src/main.ts` | `go/cli/output/errors.go` | `rust/cli/src/main.rs` | Unexpected filesystem/spawn/runtime failures expose native wording/path formatting. Explicit EnvdenError codes and fixed messages remain the shared contract. |
| HTTP framing | `apps/server/src/main.ts` | `go/server/app.go` | `rust/server/src/lifecycle/transport.rs` | Runtime-owned header order, malformed-request rejection, Expect/100-continue and connection reuse can differ. Go's notes describe absolute-form Host selection, HTTP/1.1 missing-Host rejection, HTTP/1.0 missing-Host 404 and HEAD Content-Length: 0. B3 still requires GET status/headers and no HEAD body, subject to runtime length emission. |
| Idle timer granularity | `apps/server/src/main.ts` | `go/server/main.go` | `rust/server/src/lifecycle/transport.rs` | Configured idle/header deadlines are 10 s, including ui. Bun checks idle timers periodically: observed close 10–12 s versus Go/Rust 10 s (B21 revision). |
| Library diagnostic text | `packages/core/src/protocol/codecs/server/http.ts` | `go/core/protocol/codecs/server/schema.go` | `rust/protocol/src/protocol/codecs/server/http.rs` | OPAQUE and schema-library diagnostic wording differs. Go uses bytemare/opaque and INVALID_DATA “Invalid protocol data”; Rust uses serde/custom validation. Acceptance, typed codes and fixed application errors must match. |
| HPKE test method | `packages/core/src/protocol/epochs/wrap.ts` | `go/core/protocol/codecs/epochs/wrap.go` | `rust/vendor/hpke/ENVDEN-PATCH.md` | Go crypto/hpke cannot inject an ephemeral key: tests open stored wraps and check ephemeral public keys. TS/Rust support deterministic vector reproduction; Rust carries an HPKE patch. Production wrapping always uses fresh randomness. |
| B14: approval immediately after takeover (open) | `apps/cli/src/links/takeover/adopt.ts` | `go/cli/links/takeover/adopt.go` | `rust/cli/src/links/takeover/adopt.rs` | The plan records a flaky changed-versus-held-back/needs-approval result. No cause found in TS or Go; deterministic timing input and regression proof remain outstanding. Rust was not re-tested here. |
| Hand-edited JSON extremes | `apps/cli/src/state/store/repository.ts` | `go/cli/state/store/repository.go` | `rust/cli/src/state/json.rs` | Rust notes: serde_json rejects 1e400 and keeps integers above 2^53 exact, while JSON.parse yields Infinity/rounding. Only hand-edited files reach this difference. |

Sources: `docs/ports/go-parity.md` from the Go worktree and `docs/ports/rust-parity.md` from the Rust revision above; B3/B5/B14/B20/B21 revisions from the cross-implementation decision list. Unicode crate versions come from Rust's root `Cargo.lock`; Unicode table declarations were checked in the locally cached crate sources. These sources describe previous parity work; this inventory did not rerun its runtime harness. The plan also leaves B26's load-sensitive nonce count for investigation; no new conclusion is claimed here.

## How this was built

The TS command list came from the actual Commander tree, not help text. This includes shared onboarding options and the hidden refresh flag. Commander adds help lazily, so help options/commands were expanded separately; the internal telemetry dispatch was found in main.ts.

```sh
# Baseline and changing port snapshots
git rev-parse HEAD
git -C "$GO_WORKTREE" rev-parse HEAD
git fetch origin
git rev-parse origin/port/rust
git ls-tree -r --name-only origin/port/rust rust docs/ports
git show origin/port/rust:<path>

# Mechanical TS candidates; tests were excluded from the runtime inventory
rg -n '\.(command|option|addOption|argument)\(|new Command|new Option' apps/cli/src
rg -n '\.(get|post|put|delete|patch|head|all)\(' apps/server/src apps/cli/src/ui
rg -n 'export const|z\.object|z\.enum|z\.union|z\.discriminatedUnion' packages/core/src/protocol
rg -n 'process\.env|Bun\.env|env\.|env\[|ENVDEN_|NO_COLOR|DO_NOT_TRACK|PROXY' apps packages
rg -n 'writeFile|atomicWrite|rename\(|Bun.write|appendFile|copyFile|symlink\(|open\(' apps/cli/src apps/server/src packages/adapters
rg -n 'secret\(|input\(|consent\(|choose\(|chooseMany\(|confirm\(|prompt\(' apps/cli/src
rg -n 'TErrorCode|errorExitCode|process.exit|exitCode' packages/core/src/errors apps/cli/src

# Counterpart searches (Rust files read with git show into a scratch snapshot)
rg --files "$GO_WORKTREE/go"
rg -n '<command, flag, question fragment, schema/type or filename>' "$GO_WORKTREE/go" "$RUST_SNAPSHOT/rust"
rg -n 'unicode-normalization|unicode-general-category|icu_collator' "$RUST_SNAPSHOT/Cargo.lock"
```

Commander traversal used Bun with `createProgram(() => 0)`, recursively collecting `name()`, `registeredArguments`, `options` (flags, descriptions and hidden bits), and `commands`. It did not parse argv or execute actions. Hono API prefixes were resolved from the mount; every GET gained a separate HEAD row under B3. Schema branches and write targets were followed from each hit. Failed literal searches were retried with port type names, split path segments and shared dispatchers before marking MISSING. Markdown formatting and repository checks use `./node_modules/.bin/vp check --fix`.
