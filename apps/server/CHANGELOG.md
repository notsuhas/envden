# @envden/server

## 0.3.8

No changes in this release.

## 0.3.7

No changes in this release.

## 0.3.6

No changes in this release.

## 0.3.5

No changes in this release.

## 0.3.4

No changes in this release.

## 0.3.3

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

### Patch Changes

- a902cd6: Fewer ways to get confused:
  
  - Setup and repair tokens are one word, so a double-click copies all of it, and the server labels them. `envden setup --host-server` no longer asks for one.
  - Server addresses, tokens, recovery keys and pairing codes are checked as you enter them, before the password. A bare host works anywhere an address is asked for. The pairing code is visible while you type it.
  - Server errors say what went wrong and what to run next. Push and pull ask for the master password when the unlock has expired. A wrong password or a mismatched confirmation asks again.
  - `push`, `pull`, `diff`, `resolve`, `doctor` and `config` print plain text; `--json` gives JSON. The recovery kit prints as a labelled block and waits until you've saved it.
  - Tailscale and keychain problems name the cause and the fix. Setup won't replace another service on port 443.
  - Plain words replace protocol terms in help, messages and docs.

## 0.3.0

### Minor Changes

- 97eadec: The server shows a read-only status page at `/` (and `/v1/status`): version, uptime, mode, vault count, storage and last prune. It never shows device names or vault IDs. Turn it off with `ENVDEN_STATUS_PAGE=off`. Pruning now frees old versions after deletes, and deletes go through even over the storage quota.

## 0.2.3

### Patch Changes

- 84222d2: Remaining fixes from the review.
  
  - A removed device working with the server can no longer pass off its own branch as a repair drop; rejoin now stops with a fork.
  - `join`/rejoin no longer hold the state lock while waiting for the other device, and `--resume` fails fast when there is nothing to resume.
  - Repo IDs follow global `url.<base>.insteadOf` rewrites, so shorthand and https clones of one repo sync. Ports are still ignored.
  - `serve --restored` can repair a backup taken during a server move.
  - Pruning frees old blobs after deletes, and deletes go through even over the storage quota.

## 0.2.2

No changes in this release.

## 0.2.1

No changes in this release.
