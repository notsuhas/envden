# Binary parity

Run from the repository root with Bun, Git and `diff` on PATH. No application modules are imported.

```sh
(cd apps/cli && bun run build)
cp apps/cli/dist/envden /tmp/envden-reference-copy
bun parity/run.ts --reference apps/cli/dist/envden --candidate /tmp/envden-reference-copy
bun parity/run.ts --reference apps/cli/dist/envden --candidate go/dist/envden --scenario recovery-sync --keep
bun test parity/__tests__
bun parity/verify.ts apps/cli/dist/envden
```

`--scenario` is repeatable. Unknown options or scenarios fail. Any observation mismatch, unexpected exit, missing prompt or infrastructure failure exits nonzero. Mismatches print unified diffs. `--keep` prints the two artifact roots; otherwise all scenario data is removed, including failed runs. Retained roots contain temporary secrets and fixture data.

For a shared server implementation, add `--server-binary <bin>`. To pin device A to TS while device B uses each run's default implementation, add `--device-binary a=apps/cli/dist/envden`. Device bindings are repeatable. The same declarative scenarios support these mixed vaults without changes.

## Isolation and observations

Each side of every scenario gets separate HOME, ENVDEN_HOME, XDG configuration, temporary directories, Git repositories, worktrees and server directories. Commands inherit a small environment rather than the caller's credentials. Git uses fixed author and commit dates and ignores global/system configuration. Update checks, telemetry and report offers are disabled. On macOS, doctor runs under `sandbox-exec` with Tailscale process execution denied. Other platforms skip doctor execution with a reason until equivalent isolation is configured. The CLI deliberately ignores PATH for trusted executables, so a PATH stub would not isolate it.

The full 18-scenario TS-versus-TS run took 302.1 seconds on this Mac. Both sides run sequentially. Each process has a 30-second deadline; server startup has 15 seconds. PTY prompts wait on output events rather than sleeps. Servers come from the implementation under test, start with port zero, and are stopped before observation. Restored-server scenarios reuse the previously assigned port so device addresses remain valid.

The runner compares exit status exactly per command, plus the final file tree of the entire temporary root. After the existing random-value normalization, names, contents, modes, symlinks, state and config files remain exact. Terminal presentation is compared semantically; it never changes file or database comparison. SQLite files are replaced by logical dumps of every table, schema and row, with SQLite storage types, lossless integer values and BLOB lengths. Normalized rows are sorted, preserving duplicates. The fixture database in `channel-probe` also exercises ordinary literal rows.

## Presentation rule

This replaces byte-for-byte terminal output parity. stdout and stderr compare multisets of facts: paths, filenames, repository IDs, device names, numbers, versions, URLs, normalized placeholders, quoted names, error codes and outcome keywords such as pushed, pulled, conflict, skipped, removed, in sync and held back. Device and repository names from scenario arguments and saved state also count when printed without labels or quotes. Fact values and multiplicities remain exact. Fixed wording may differ in case and punctuation; ANSI/VT controls, boxes, bullets, spinners, blank lines, padding, alignment and word wrapping do not count.

PTY steps also compare the ordered prompt sequence by keywords, the choices offered, and the answers sent. Each answer records the visible conversation before it is sent, preserving choices that disappear after selection. Each answer is sent only once its prompt is on screen. A line naming a prompt counts as the prompt's title, and leaves the stdout facts, only when it ends in a question mark or choice rows or one indented answer follow it; error and outcome lines that mention a prompt keep their facts. Expected prompt matching ignores case and punctuation. Unknown questions remain observable. PTY stdout and stderr still share one terminal stream; noninteractive streams stay separate.

Commands using `--json` parse stdout and compare its serialized structure exactly after random-value normalization. Whitespace is ignored; values, types, array order and object key order remain strict. Malformed JSON fails. Help compares command and option sets instead of descriptions or layout. Errors retain their facts and outcome keywords, with exit status checked separately.

Files ending in `.pdf` compare ordered text from `Tj` and `TJ` operators and Info fields, excluding CreationDate, ModDate and ID. Every FlateDecode stream is inflated with `node:zlib`; literal and hex strings are decoded. Compression and drawing layout may differ. Unsupported stream filters and malformed content fail rather than falling back to opaque bytes. PDF names and modes remain exact.

## Normalization

A run has one registry shared across command output, files and SQLite. Crockford base32, hexadecimal and base64url values decode to the same byte identity. Random values receive numbered placeholders grouped by byte length. Repeated bytes retain their identity; new bytes retain their length and get a new identity. BLOB observations include SHA-256 of that placeholder structure, rather than a hash of random ciphertext. Ciphertext is opaque, so equal-length cryptographic corruption is only detected when it changes equality relationships or observable behavior.

Explicit roots and executable paths have stable names, including macOS `/private` aliases. Ports are normalized as local URLs. Recovery keys, pairing codes, UUIDs and filesystem identities have separate placeholders. SHA-256 key-slot filenames derived from temporary namespaces are mapped to their documented slot names. Backup filenames are anchored by literal content hash and occurrence count in transcript order, avoiding random UUID order when several copies are backed up in the same millisecond. Device state seeds identities before walking random filenames; SQLite seeds further byte identities before the file tree is traversed. Nonce numbering is scoped by device to avoid dependence on request interleaving. Fresh snapshot identities are canonically labeled from the complete normalized tree and database relationships, independent of raw filename or row order. Ties are resolved by comparing full observations, preserving file presence, content, modes, links and equality relationships.

Real clock values, including fractional filesystem times, become `<TIME>` and durations, including minute/hour relative times, become `<DURATION>`. Padding after a relative-time history column becomes one space, because its width changes with the clock. Clock equality and elapsed-time arithmetic are deliberately outside this comparison. Ordinary counts, versions, numeric sequence strings and SQLite types remain literal. Scenario-written fixture strings are protected, and `.env` files are always compared literally. Paths inserted as placeholders are protected from subsequent token normalization.

PTY output is rendered into logical lines: cursor-up, erase-line, carriage-return, colors and redraw sequences update the current line rather than append frames. A carriage-return redraw replaces the whole logical line, dropping leftover spinner suffixes; CRLF retains the completed line. Incomplete spinner frames are discarded; finalized text is retained. PTY stdout and stderr share the terminal stream and are compared together in the stdout observation. Noninteractive commands retain separate streams. Raw PTY bytes are not compared.

Files other tools write while envden runs them, such as PowerShell's startup cache under `~/.cache/powershell`, are compared by presence and mode only, since their bytes change on every run.

Pairing uses a local forwarding proxy that holds slot reads until the matching write completes, and approver reads until the signed swap completes. This removes timing-dependent polling requests and nonce rows without filtering stored DB rows. Move interruption scenarios inject one protocol error at a named boundary, then allow the retry or abort to proceed. These proxies never replace server state or implement protocol operations.

## Scenarios

- `channel-probe`: literal filesystem/DB fixture and version; used by wrapper mutation verification.
- `help`: root help and every command/subcommand, including shell, agent, update and UI help.
- `errors-config`: version, unknown command/option, unconfigured use, non-TTY setup choices, config reads/writes and doctor JSON.
- `setup-interactive`: prompts, JSON recovery kit, human/JSON status, diff/history and doctor.
- `pairing-sync`: device add, pairing join, push/pull, literal transferred bytes and reports.
- `recovery-sync`: kit join, push/pull, refused unattended restore and approved restore.
- `conflict-edit`, `conflict-keep-mine`, `conflict-take-server`: conflict creation, JSON listing, marker refusal, resolution, push/pull.
- `files-worktrees`: registered Git worktree auto-approval, placement mode, track, local-only, alias, removal and untrack.
- `symlink-takeover`: consent to replace a foreign env link, then restore the original link on untrack.
- `devices-vault`: device listing/rename/removal, wrong password followed by unlock, kit replacement, password change/reset and rotation.
- `server-move`: successful move and the current TS switch refusal, recorded in [go-parity.md](go-parity.md).
- `server-move-resume`, `server-move-abort`: interrupt after source commit or before chain transfer, then resume/abort.
- `server-repair`, `server-repair-without`: restored mode, upload, finish, unavailable-device removal and accept-lost flag.
- `onboarding-errors`: invalid token, unreachable server and unknown pairing mailbox.

Flows come from `apps/cli/scripts/e2e.ts`, its onboarding/conflict helpers, CLI command and onboarding tests, move/repair/recovery tests, server lifecycle tests and docs/DESIGN.md. The runner depends on their public command syntax and persisted formats, never their implementation exports.

## Adding a scenario

Add an `IScenario` with a name and a list of named steps, then register it in `run.ts`. Each command names its device. Reuse setup/join helpers and the CLI/edit step constructors. Expected nonzero exits must be explicit; equal failures on both sides do not count as success. Use PTY answers matched to expected prompt keywords for interactive commands. Add literal fixtures through `normalizer.literal` before writing them. Avoid clock thresholds and sleeping to coordinate processes.

Run the new scenario against two copies of TS first, then rerun the full suite and `verify.ts`. The latter wraps the real binary six times and changes a stdout fact, a stderr fact, exit status, file content, file mode or a DB row; every run must fail with a diff naming that channel.

## Limits

The suite targets POSIX Bun terminals, symlinks and modes. It does not exercise Windows placement fallback. It compares final persistent state, not every intermediate write or HTTP wire bytes. It does not decode encrypted payloads or prove cryptographic correctness. Token-shaped arbitrary text outside protected env fixtures may normalize; keep such fixtures explicitly registered.

Repair uses a clean stopped server restarted as restored. It exercises `--accept-lost` syntax alongside dropping B, but does not manufacture a genuinely missing ciphertext version. Longer backup histories, server pruning, time expiry and every crash boundary need additional scenarios. The switch refusal is preserved rather than fixed.

Update execution, GitHub downloads, telemetry transmission and `setup --host-server` service installation are excluded because they require external services or modify host services. Their help remains covered. Doctor's tailnet-unavailable branch uses the macOS process sandbox. No real keychain or user configuration is accessed.
