---
"@envden/cli": patch
---

Conflict files now show both versions between git-style markers, around just the conflicting keys when the rest merges, and `envden resolve` refuses an edit while markers remain. Pull prints one line per conflict with the checkout path, summaries no longer contradict themselves, a pull counts each env file once, and backups are reported only when they saved an edit the server doesn't have.
