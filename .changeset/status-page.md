---
"@envden/server": minor
---

The server shows a read-only status page at `/` (and `/v1/status`): version, uptime, mode, vault count, storage and last prune. It never shows device names or vault IDs. Turn it off with `ENVDEN_STATUS_PAGE=off`. Pruning now frees old versions after deletes, and deletes go through even over the storage quota.
