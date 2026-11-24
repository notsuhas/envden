---
"@envden/cli": minor
---

`envden status`, `envden doctor` and the shell line now compare each tracked env file with its template (`.env.example`, `.sample`, `.template` or `.defaults`) and name keys the env file is missing. `status` and `doctor` also name extra keys. Only key names are shown, never values. No template means no warning.
