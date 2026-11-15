# Binary parity

Requires Bun 1.4+, Git and POSIX PTYs. No implementation modules are imported.

```sh
(cd apps/cli && bun run build)
bun parity/run.ts --impl ts=apps/cli/dist/envden --impl self=apps/cli/dist/envden
bun parity/run.ts --impl ts=apps/cli/dist/envden --impl rust=target/release/envden --filter sync --mix
bun test parity/__tests__
```

The first implementation is the reference. Commands accept whitespace-separated arguments; use an executable wrapper for quoting or environment assignments. Paths resolve from the invoking directory. `--filter` matches scenario names. An unmatched filter or any failure exits nonzero. Failures show the first 100 lines of a unified diff.

Each scenario gets fresh homes, config, checkouts and server storage per run. Processes receive a small environment with updates, telemetry and crash reporting disabled. A PATH stub answers Tailscale status with a ready fictional network and refuses every other operation. All actual HTTP traffic uses loopback. No real keychain or tailnet is used. `PARITY_KEEP=1` keeps temporary directories, which contain test passwords and private keys. Default runs delete them even on failure.

## Scenarios

| Name | Checks |
| --- | --- |
| command-surface | Help and version for every command/group from `program.ts`; unknown command/option |
| sync | Remote setup, recovery-kit join, human/JSON status, diff, push/pull, history and restore, aliases, deletion, conflict list/JSON, marker refusal, edited resolution |
| pairing | Device add and pairing join, wrong pairing mailbox, list/JSON, rename, removal, removed-member rejection |
| credentials | Wrong-password retry, unlock, password change/reset, kit replacement, vault rotation |
| checkouts | Worktree discovery, local-only, untrack, track with symlink takeover, restore foreign link |
| server-move | Move to a fresh server; resume/abort with no pending move |
| server-repair / server-repair-without | Restored server, repair upload/completion, accept-lost and dropping an unavailable device |
| settings | Config, shell install/idempotence/uninstall for each shell, agent install, unconfigured status |
| invalid-input | Invalid ports/settings/address/shell, missing destination and unconfigured operations |
| unreachable | Push, pull and JSON status after server shutdown |

All command names are maintained in `harness/commands.ts`. `lock` is absent from the reference CLI; unlock expiry requires elapsed wall time or internal-state injection, so locked-session coverage is pending. Host-here setup installs a login service and changes Tailscale Serve, so it is deliberately not run on this shared machine. Host-here refusal and full service installation need an isolated OS sandbox. `ui` is help/version only; browser behavior is outside this binary harness. `doctor` and `update` are help/version only: doctor includes host diagnostics, and update contacts public release infrastructure or replaces executables. Actual interrupted move resume/abort, wrong-secret pairing authentication and lost-blob repair still need scenarios. The current suite does not claim full command-behavior coverage.

## Comparison and normalization

Piped commands retain separate stdout, stderr and exit status. PTYs merge stdout/stderr by OS design; their stdout is the rendered terminal screen, with cursor moves/erasures applied. Intermediate spinner frames and password-entry repaints disappear, while final prompts, answers and messages remain. Every step asserts an explicit exit code before comparing implementations.

Snapshots include each user home (including checkout/worktree files, kits and shell integrations) and ENVDEN_HOME. Git internals are excluded. Entries retain names, contents, permission bits and symlink targets without following symlinks. SQLite snapshots compare exact schema SQL and every table's rows in insertion order; raw database pages and WAL layout are excluded.

Declarative text rules live in `harness/normalize.ts`:

- Implementation executable paths become `<EXECUTABLE>`. Temporary roots, including macOS `/private` aliases, become `<ROOT>`.
- Loopback addresses, UUIDs, pairing codes, 26-character IDs, long hex, tokens and base64url values receive first-appearance placeholders with kind, ordinal and length. Repeats keep the same placeholder within a scenario, across steps and snapshots.
- Wall-clock timestamps become `<TIME>`; incidental clock equality is not compared. Filesystem identity tuples become `<FS_IDENTITY>`.
- JSON objects sort keys. Encoded byte fields and crypto fields keep equality and encoded length. SQLite BLOBs keep byte length and identifier columns also keep equality; opaque binary files keep length and their format byte, while private key files keep length only. Cryptographic validity is exercised by subsequent real CLI commands; opaque bytes are not decrypted by the harness.
- Randomly named backups sort by contents; key files sort by length. Replay-cache nonce rows compare unique normalized row shapes, not multiplicity: pairing polls produce a timing-dependent number of signed requests. All other table row counts remain exact. State references seed filename normalization before walking the tree, avoiding random hash sort order.

These masks intentionally cannot prove cryptographic or ciphertext byte parity. Use protocol vectors separately. A passing TS self-comparison only checks harness repeatability for the exercised paths.

## Add a scenario

Add one `.ts` file under `scenarios/` (domain subfolders are supported), register it in `catalog.ts`, exporting an `IScenario` with `name`, `roles` and `run(context)`. Use `device`, `server`, `run` and `pty`; file/Git edits are fixture operations, never implementation imports. `run` defaults to exit 0; give each intentional failure its expected code. PTY scripts wait for prompts, send answers, then call `finish`. Always declare every role, including destination servers.

`--mix` runs each candidate in all roles, then substitutes it into each single role against the reference everywhere else. This covers reference server/candidate devices, candidate server/reference devices, and mixed devices in one vault. Every assignment compares with the same all-reference scenario, including snapshots. It does not enumerate the exponential Cartesian product for three or more implementations.
