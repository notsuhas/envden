---
"@envden/cli": patch
---

Device keys are now private files in `~/.envden`, like SSH keys in `~/.ssh`, instead of the OS keychain. macOS no longer asks for keychain access after every update. `ENVDEN_KEYCHAIN` is gone, and `envden doctor` fails if other users can read the key files.
