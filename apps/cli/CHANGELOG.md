# @envden/cli

## 0.3.8

### Patch Changes

- The checkout scan in `setup` and `track` checks up to eight repos at a time instead of one by one. On a home folder with 63 repos it went from 33 seconds to 8.
- 8265a12: Rerunning `envden setup --host-server` keeps the server's port instead of moving it away from what Tailscale and your devices use. On Windows, the server's scheduled task now runs on battery, has no 72-hour limit and restarts after a failure, `envden update` keeps a non-default port, and the server's key and database are restricted to your user.
  
  `envden serve` no longer creates CLI state in your home folder or checks for notices from the server it is starting.
- 8265a12: The checkout scan in `setup` and `track` no longer enters hidden folders (`~/.codex`, `~/.gradle`, …), dependency folders like `Pods` or `vendor`, or clones nested inside a checkout, so it no longer walks for minutes. Agent worktrees under hidden folders are still found through `git worktree list`. A spinner shows progress, and skipped repos are counted in one line instead of one line each; `--verbose` lists them. Build folders like `target` are skipped only inside a project and tool folders like `~/go` or `~/AppData` only in your home folder, a folder is judged by its own name (so `~/code -> ~/.projects` is scanned), and a stray `git init` no longer hides the repos inside it. Scans work with git older than 2.36, and one repo git can't list no longer stops the scan. The `--verbose` hint repeats the command you ran. When a checkout's `.env` is your own symlink to a regular file, envden offers once per target to manage it: the checkouts then use the synced copy instead of that file, and `untrack` puts your link back. A link to another env file in the same checkout is left alone.
- 8265a12: Telemetry works: events are sent by a short background process after each command, so they arrive and commands never wait on the network. Before, a 200 ms limit cut every request off. Interactive setup now has Yes selected for telemetry and the agent skill; `--yes` and runs without a terminal still leave telemetry off. The background sender passes on proxy and CA settings, and no longer reads or clears notices meant for you, such as a device joining with the recovery kit.
- 8265a12: Telemetry goes to a PostHog project used only by envden, which drops IP addresses on arrival. The website counts page views without cookies, and asks once before using cookies for replays and heatmaps.
- @envden/server@0.3.8

## 0.3.7

### Patch Changes

- 08afdd1: `envden setup --host-server` publishes the server on its own port, `https://<machine>.<tailnet>.ts.net:4783`, instead of taking the machine's main HTTPS address from other apps. If port 4783 is busy, it picks a free one.
- 12c6411: Device keys are now private files in `~/.envden`, like SSH keys in `~/.ssh`, instead of the OS keychain. macOS no longer asks for keychain access after every update. `ENVDEN_KEYCHAIN` is gone, and `envden doctor` fails if other users can read the key files.
- e0e097d: macOS binaries are signed with a Developer ID and notarized by Apple, so macOS knows who made them and doesn't warn about an unidentified developer.
- 08afdd1: Running `envden setup` again no longer asks to approve checkouts that are already tracked.
- @envden/server@0.3.7

## 0.3.6

### Patch Changes

- c9dfe28: Work with dotfiles setups where config paths are symlinks. Setup no longer fails when `~/.claude/skills` and `~/.agents/skills` are the same folder, and a skill or shell notice that can't be installed is now a warning. The agent skill, shell notice and login service write through symlinks to their dotfiles targets, checkout scans follow symlinked folders such as `~/Work` on another disk, and `ENVDEN_HOME` can be a symlink.
- fdb2bde: Save the recovery kit as a printable PDF in Downloads instead of printing the secret key to the terminal. `--kit-out` still writes JSON for scripts.
- 8a0e717: envden offers to report a failure unless it's clearly yours to fix (a typo, a wrong password, an expired unlock, an update to install, an unreachable server or a sync conflict). A failed setup step now gets the offer. Optional setup steps (the shell notice and agent skill) print a warning instead of stopping setup.
- @envden/server@0.3.6

## 0.3.5

### Patch Changes

- a7d6140: `envden setup --host-server` on macOS waits for launchd to finish unloading the old server before loading the new one, instead of failing with "Could not install the envden login service". If loading still fails, the message includes launchd's own error.
- 1c7581c: When a command fails because of a bug in envden, the CLI offers to report it: it saves a redacted report, then starts your coding agent (Claude Code, Codex or Gemini CLI) to find the cause and draft a GitHub issue, or opens a pre-filled issue in the browser. `ENVDEN_NO_REPORT=1` turns the offer off. A failed server service install now exits with code 1 instead of 2.
- @envden/server@0.3.5

## 0.3.4

### Patch Changes

- 1a96695: `envden update` keeps `XDG_CONFIG_HOME`, so Homebrew finds taps trusted with `brew trust` when that variable is set.
- @envden/server@0.3.4

## 0.3.3

### Patch Changes

- f6f20cd: Conflict files now show both versions between git-style markers, around just the conflicting keys when the rest merges, and `envden resolve` refuses an edit while markers remain. Pull prints one line per conflict with the checkout path, summaries no longer contradict themselves, a pull counts each env file once, and backups are reported only when they saved an edit the server doesn't have.
- f6f20cd: Interrupting a command with Ctrl-C no longer leaves an `envden-git-config-*` folder in the temp directory.
- f6f20cd: Setup and join end with a summary: the server, this device's final name and the env files it syncs. The checkout list starts with every checkout selected and shows the env files found. The shell notice and agent skill prompts say what they do, and Enter at "Check for updates daily?" keeps checks on. Setup no longer crashes on a `.env` link into a deleted envden folder; it removes the broken link. `envden --help` groups commands by task.
- f6f20cd: `envden status` now lists files changed here, files newer on the server, conflicts and held-back files, one line each, or a single in-sync line. `envden device ls` prints a plain list and adds `--json` and `--verbose`.
- @envden/server@0.3.3

## 0.3.2

### Patch Changes

- eb8d4cc: `envden update` runs Homebrew with your own Homebrew config, so a tap you trusted with `brew trust` loads.
- @envden/server@0.3.2

## 0.3.1

### Patch Changes

- a902cd6: Fewer ways to get confused:
  
  - Setup and repair tokens are one word, so a double-click copies all of it, and the server labels them. `envden setup --host-server` no longer asks for one.
  - Server addresses, tokens, recovery keys and pairing codes are checked as you enter them, before the password. A bare host works anywhere an address is asked for. The pairing code is visible while you type it.
  - Server errors say what went wrong and what to run next. Push and pull ask for the master password when the unlock has expired. A wrong password or a mismatched confirmation asks again.
  - `push`, `pull`, `diff`, `resolve`, `doctor` and `config` print plain text; `--json` gives JSON. The recovery kit prints as a labelled block and waits until you've saved it.
  - Tailscale and keychain problems name the cause and the fix. Setup won't replace another service on port 443.
  - Plain words replace protocol terms in help, messages and docs.
- Updated dependencies [a902cd6]
  - @envden/server@0.3.1

## 0.3.0

### Minor Changes

- 97eadec: `envden ui` opens a dashboard on localhost: repos, checkouts and files with their sync status, conflicts, devices, unlock expiry and history, with pull, push, resolve, restore and rename. It only listens on 127.0.0.1, needs a per-run token and shows key names, never values.
- 97eadec: Device names: setup and join suggest your hostname (edit it, or pass `--name`), runs without a terminal use it as is, and a name that's taken gets `-2`, `-3`. `envden device rename <name>` renames this device; it needs no password while the device is unlocked.
- 97eadec: `envden history [file]` lists the versions your server keeps: when, which device pushed it, and the key names that changed. `--restore <version>` writes one back as a local edit for you to review and push.
- 97eadec: Worktrees of a clone you've approved now get its env files without a prompt. Turn it off with `envden config auto-approve-worktrees off`. Separate clones still ask once.

### Patch Changes

- Updated dependencies [97eadec]
  - @envden/server@0.3.0

## 0.2.3

### Patch Changes

- 84222d2: Remaining fixes from the review.
  
  - A removed device working with the server can no longer pass off its own branch as a repair drop; rejoin now stops with a fork.
  - `join`/rejoin no longer hold the state lock while waiting for the other device, and `--resume` fails fast when there is nothing to resume.
  - Repo IDs follow global `url.<base>.insteadOf` rewrites, so shorthand and https clones of one repo sync. Ports are still ignored.
  - `serve --restored` can repair a backup taken during a server move.
  - Pruning frees old blobs after deletes, and deletes go through even over the storage quota.
- Updated dependencies [84222d2]
  - @envden/server@0.2.3

## 0.2.2

### Patch Changes

- 782744f: Follow-up fixes from the review.
  
  - Env files are no longer placed into a re-cloned checkout that wasn't re-approved, and `resolve` no longer overwrites a file marked local-only.
  - `envden rm` on an unpublished file keeps other checkouts' local-only copies.
  - Service definitions and shell hooks use the stable Homebrew/Scoop path, and `update` rewrites the service, so a hosted server no longer stays on the old binary.
  - `vault kit replace` and `device rm --new-kit` show the new kit before committing it, and a rerun finishes an interrupted replacement.
  - Resuming setup after losing the first kit replaces the kit instead of looping.
- @envden/server@0.2.2

## 0.2.1

### Patch Changes

- Fixes from the first full review.
  
  - Breaking: `envden serve` reads the setup token from `ENVDEN_SETUP_TOKEN`. The `--setup-token` flag is gone, since it showed the token in `ps`.
  - Breaking: Device names can't contain invisible format characters (zero-width, bidi).
  - Breaking: Non-canonical X25519 public keys and live file entries with an all-zero blob hash are rejected.
  - Breaking: Keychain fallback files are named by a hash of the key name, so existing fallback keys aren't found.
  - Requests are signed with the current time. Commands that ran longer than five minutes (pairing, setup, server move, repair) failed with `UNAUTHORIZED`.
  - A file entry whose name doesn't decrypt no longer blocks pull or `device rm`. Before, a member could push one and stop its own removal.
  - An interrupted `device add` no longer blocks every later one.
  - Merge: a leading BOM no longer forces a conflict, `diff` ignores a changed final newline, and merged lines keep the local file's line endings.
  - The request time window is exclusive, closing a one-millisecond replay at the 600 s nonce expiry.
  - Restored-mode reads need membership as well as the repair proof.
  - The server keeps pruning other vaults when one fails, and prunes a minute after boot.
  - The Docker entrypoint unsets `TS_AUTHKEY` before starting `tailscaled`.
  - The PowerShell hook works on Windows PowerShell 5.1.
  - Fish hook: paths with quotes or backslashes are quoted correctly, and fish 3.5 is no longer required.
  - Shell install and uninstall only touch a complete envden block.
  - Keychain fallback files with loose permissions are refused, and long home paths no longer hit `ENAMETOOLONG`.
  - `update` runs post-install from the right binary on Scoop and keeps Node on `PATH` for npm under nvm.
  - Turning on `agent-merge` needs a terminal.
  - A folder named like `..foo` inside a checkout is treated as part of it.
- @envden/server@0.2.1
