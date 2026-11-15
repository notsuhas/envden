# @envden/cli

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
