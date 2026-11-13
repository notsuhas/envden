# Placement API update

`createFsPlacementAdapter(mode, checkoutRoot, backupDirectory?)` accepts the caller's private backup directory, normally `~/.envden/conflicts`. Pass it for reconciliation; replacing differing regular-file content fails closed if it is absent. Backups never belong in the checkout. Equal content and existing store links need no backup.

`adapter.remove(storePath: string | undefined, checkoutPath: string): Promise<void>` removes a regular checkout file or a symlink to that store, using anchored `unlinkat` on macOS/Linux. Missing files are harmless; unrelated symlinks and unsafe parents are refused. Pass `undefined` when no store path exists.

`pruneBackups(dir, now, maxAgeDays = 30): Promise<void>` is exported from `@envden/adapter-placement-fs`. `now` is milliseconds since epoch, supplied by the caller. It removes only expired adapter backup files.

macOS/Linux require native descriptor operations and fail closed on FFI initialisation failure. Windows retains the checked JS path, with a parent-swap race between its last check and filesystem mutation.
