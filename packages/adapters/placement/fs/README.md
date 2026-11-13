# Filesystem placement

Checkout mutations use anchored directory operations on macOS and Linux. Native descriptor support is required there; initialization failure stops the operation. Windows uses checked JavaScript paths and retains a parent-swap race before mutation.

Replacing differing regular-file content requires a backup in a caller-supplied private directory outside the checkout, normally `~/.envden/conflicts`. Backups must never become checkout content. Equal content and existing store links need no backup.

Removal refuses unrelated symlinks and unsafe parents. Backup expiry uses caller-supplied time so retention is predictable and testable.
