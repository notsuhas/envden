# @envden/server

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
