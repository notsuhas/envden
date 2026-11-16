# Binary parity

Requires Bun 1.4+, Git, POSIX PTYs and `pdftotext` from Poppler. No implementation modules are imported.

```sh
(cd apps/cli && bun run build)
bun parity/run.ts --impl ts=apps/cli/dist/envden --impl self=apps/cli/dist/envden
bun parity/run.ts --impl ts=apps/cli/dist/envden --impl rust=target/release/envden --filter sync --mix
bun test parity/__tests__
```

The first implementation is the reference. Commands accept whitespace-separated arguments; use an executable wrapper for quoting or environment assignments. Paths resolve from the invoking directory. `--filter` matches scenario names. An unmatched filter or any failure exits nonzero. Failures show the first 100 lines of a unified diff.

Each scenario gets fresh homes, config, checkouts and server storage per run. Processes receive a small environment with updates, telemetry and crash reporting disabled. A PATH stub answers Tailscale status with a ready fictional network and refuses every other operation. The frozen reference bypasses PATH for trusted host tools, so Tailscale status and doctor can read the host network state; these checks do not change it. Vault HTTP traffic uses loopback. No real keychain is used. `PARITY_KEEP=1` keeps temporary directories, which contain test passwords and private keys. Default runs delete them even on failure.

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

Additional scenarios:

| Name | Checks |
| --- | --- |
| pairing-secret | Wrong secret in a valid mailbox, waiting approver cancelled, fresh code succeeds |
| server-move-interrupted | Fault before source commit → abort; fault before destination commit → abort refused → resume; source offline → switch rejection for locked peer and success for mover |
| server-repair-lost | Restore an older backup, remove the only device's blob cache, refuse completion without accept-lost, recover an older verified version with it |
| locked-session | Set/read minimum 1d period, exhaust three password retries, unlock successfully and push |
| user-flow | Default PTY setup/join, PDF kit, preferences and integrations, exact e2e.ts file edits and conflict round |
| recovery-pdf | Remove a kit-holding device with a replacement JSON kit, then replace with a PDF kit |
| maintenance | Real doctor text/JSON, version, agent install/idempotence, post-install refresh, history/diff/pull variants, headless PTY UI GET and Ctrl-C shutdown |
| file-options / resolution-options | Copy placement/tracking, config, history confirmation/all, plain removal; both conflict choices, repo selection, JSON and nonterminal refusal |
| onboarding-options | Explicit setup preferences, token/scan flags, missing join-resume state, pasted recovery join, notice-cache refresh |

All command names are maintained in `harness/commands/catalog.ts`, checked against `program.ts` and the command definitions. Remaining limits prevent calling this a complete port definition of done:

- Host-here **cannot safely run with PATH shims**: the frozen reference's `packages/core/src/process/{trust,directories,environment}.ts` resolves tools from fixed trusted system directories and discards PATH. Doctor confirms sandbox shims are bypassed. `harness/host/shims.ts` supplies logging shims for Tailscale, launchctl, systemctl, loginctl, schtasks, PowerShell and browser openers; any log produced is included in home snapshots. Full host setup (including `--host-server`) requires an isolated OS/VM with shims at those fixed paths, plus sandbox TLS forwarding for Tailscale Serve. Never run it on this shared host.
- `lock` does not exist. Minimum expiry is 1d (`settings/unlock-period.ts`); no supported clock/short-period environment override exists. Expiry-triggered sync prompts and timed server rate-limit lockouts need elapsed time or forbidden internal-state injection. Three failed unlock attempts and subsequent successful unlock are covered.
- Wrong-secret pairing leaves the approver waiting for KE3; the scenario records Ctrl-C cancellation rather than waiting ten minutes.
- `update --check` forces a public release request even with `ENVDEN_NO_UPDATE_CHECK=1`; update installation replaces the executable. Both remain excluded. `update --post-install` runs without network; automatic checks remain disabled throughout.
- `server switch` on the other device after a move currently returns “Unlock expired”; the suite records this reference behavior. Success on the already-unlocked mover is covered, but successful offline-source switching by another member remains a gap.
- UI coverage is startup, HTML fetch and clean shutdown; browser interactions remain outside this harness. Command groups have help coverage; operational leaves have behavioural steps. This is not exhaustive input-value coverage.

## Comparison and normalization

Piped commands retain separate stdout, stderr and exit status. PTYs merge stdout/stderr by OS design; their stdout is the rendered terminal screen, with cursor moves/erasures applied. Intermediate spinner frames and password-entry repaints disappear, while final prompts, answers and messages remain. Every step asserts an explicit exit code before comparing implementations.

Terminal output compares semantically by default. ANSI, terminal glyphs and whitespace are discarded; ordered fact tokens retain normalized identities, paths, quoted strings, file names, numbers, named fields and shared outcome words. PTY records also compare each question, offered choices in order and the answer sent. Queued recovery-join notices compare per device across the scenario, retaining member names, order and occurrence counts; delivery on adjacent commands can vary. Prompt labels and choices retain their text after styling and whitespace removal. JSON output is parsed and compared exactly after the existing normalizers; help compares exact sets of declared subcommand and option names. Command rows count under any heading; only the first token counts, and descriptions and wrapped lines do not. Option aliases count separately, including options with descriptions on the following line. Positional arguments do not count. Built-in `help`, `-h`/`--help` and `-V`/`--version` entries are ignored on both sides; the `version` command still counts.

`--strict-output` restores normalized byte-level stdout/stderr comparison. It works with any `--impl name=path`, including Go binaries. Terminal presentation and notice wording may differ when the extracted facts and outcomes agree. Semantic comparison uses a shared vocabulary, not a general natural-language equivalence check.

File trees and DB snapshots keep their existing exact comparisons after normalization, independent of terminal comparison mode. State and config contents receive no semantic filtering. Snapshots include each user home (including checkout/worktree files, kits and shell integrations) and ENVDEN_HOME. Git internals and PowerShell’s nondeterministic runtime cache (`.cache/powershell`) are excluded. Entries retain names, contents, permission bits and symlink targets without following symlinks. SQLite snapshots compare exact schema SQL and every table's rows in insertion order; raw database pages and WAL layout are excluded.

Declarative text rules live in `harness/normalize.ts`:

- Implementation executable paths become `<EXECUTABLE>`. Temporary roots, including macOS `/private` aliases, become `<ROOT>`.
- Loopback addresses, UUIDs, pairing codes, 26-character IDs, long hex, tokens and base64url values receive first-appearance placeholders with kind, ordinal and length. Repeats keep the same placeholder within a scenario, across steps and snapshots.
- PDFs compare extracted text, including vault ID, secret key, server, labels and instructions, after whitespace and the existing random/time/path normalizers. Poppler handles font encodings and text operators across writers. Internal PDF bytes, compression, metadata and drawing geometry may differ. This also applies with `--strict-output`.
- Human relative times become `<RELATIVE_TIME>`, formatted wall-clock dates become `<TIME>`, and random six-character kit filename suffixes retain identity placeholders.
- Wall-clock timestamps become `<TIME>`; incidental clock equality is not compared. Filesystem identity tuples become `<FS_IDENTITY>`.
- JSON objects sort keys. Encoded byte fields and crypto fields keep equality and encoded length. SQLite BLOBs keep byte length and identifier columns also keep equality; opaque binary files keep length and their format byte, while private key files keep length only. Cryptographic validity is exercised by subsequent real CLI commands; opaque bytes are not decrypted by the harness.
- Randomly named backups sort by contents; key files sort by length. Replay-cache nonce rows compare unique normalized row shapes, not multiplicity: pairing polls produce a timing-dependent number of signed requests. All other table row counts remain exact. State references seed filename normalization before walking the tree, avoiding random hash sort order.

These masks intentionally cannot prove cryptographic or ciphertext byte parity. Use protocol vectors separately. A passing TS self-comparison only checks harness repeatability for the exercised paths.

## Add a scenario

Add one `.ts` file under `scenarios/` (domain subfolders are supported), register it in `catalog.ts`, exporting an `IScenario` with `name`, `roles` and `run(context)`. Use `device`, `server`, `run` and `pty`; file/Git edits are fixture operations, never implementation imports. `run` defaults to exit 0; give each intentional failure its expected code. PTY scripts wait for prompts, send answers, then call `finish`. Always declare every role, including destination servers.

`--mix` runs each candidate in all roles, then substitutes it into each single role against the reference everywhere else. This covers reference server/candidate devices, candidate server/reference devices, and mixed devices in one vault. Every assignment compares with the same all-reference scenario, including snapshots. It does not enumerate the exponential Cartesian product for three or more implementations.

## Rust server hybrid

`parity/hybrid/envden` delegates `serve` to `target/server/debug/envden-serve` and every other command to the built TypeScript CLI.
Build with `CARGO_TARGET_DIR=target/server cargo build -p envden-server --bin envden-serve`, then run `bun parity/run.ts --impl ts=apps/cli/dist/envden --impl hybrid=parity/hybrid/envden`.

## CI host installation

`PARITY_HOST_SHIMS=1` enables `host-here` only with `CI=true` and `GITHUB_ACTIONS=true` on Linux. The Rust CI job installs the logging shims into `/usr/bin` on its disposable runner before starting either binary. Never run the installer on a shared machine.

The scenario creates a vault on loopback, then runs `setup --host-server` twice. It compares service definitions, Tailscale exposure, host-tool logs and repeat installation for TS against itself and against Rust. First-time host onboarding over Tailscale HTTPS still needs TLS forwarding and is not covered.
