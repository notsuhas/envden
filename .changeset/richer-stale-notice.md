---
"@envden/cli": minor
---

The shell line now says what changed on the server: `envden: api/.env 2 keys changed on throwbook (STRIPE_KEY, DB_URL); run envden pull`. It names the file, the device that pushed it and up to three keys, never values.

New opt-in setting `envden config auto-pull on` lets the shell's background refresh pull files you haven't touched since the last sync, and prints `envden: pulled api/.env (2 keys)` on your next prompt. Local edits, deletions and conflicts are never pulled automatically; they keep the warning. Off by default.
