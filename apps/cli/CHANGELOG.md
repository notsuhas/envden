# @envden/cli

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
