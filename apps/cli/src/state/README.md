State writes use `withStateLock(home, async () => { ... })` from `./lock.ts`.
Pass the adapter's absolute home path. Wrap the whole read → change → write transaction.
Nested calls in the same async operation reuse the lock; unrelated callers fail with CONFLICT.
The lock directory is `<home>/state/write.lock`; owner.json records PID, start time and an ownership token.
Dead owners are reclaimed. Release only removes the caller's own lock.
`saveState(home, state)` takes this lock too. Other state files and keychain mutations need the outer transaction lock.
