---
"@envden/cli": patch
---

Follow-up fixes from the review.

- Env files are no longer placed into a re-cloned checkout that wasn't re-approved, and `resolve` no longer overwrites a file marked local-only.
- `envden rm` on an unpublished file keeps other checkouts' local-only copies.
- Service definitions and shell hooks use the stable Homebrew/Scoop path, and `update` rewrites the service, so a hosted server no longer stays on the old binary.
- `vault kit replace` and `device rm --new-kit` show the new kit before committing it, and a rerun finishes an interrupted replacement.
- Resuming setup after losing the first kit replaces the kit instead of looping.
