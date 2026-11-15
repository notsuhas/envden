---
"@envden/cli": patch
---

When a command fails because of a bug in envden, the CLI offers to report it: it saves a redacted report, then starts your coding agent (Claude Code, Codex or Gemini CLI) to find the cause and draft a GitHub issue, or opens a pre-filled issue in the browser. `ENVDEN_NO_REPORT=1` turns the offer off. A failed server service install now exits with code 1 instead of 2.
