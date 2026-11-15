---
name: envden
description: Sync this checkout's env files with envden.
---
Commands and flags: https://envden.theclau.de/docs/cli
Syncing and conflicts: https://envden.theclau.de/docs/push-pull-merge
Agent rules: https://envden.theclau.de/docs/agents

Run envden status --json before syncing. Run envden push --yes or envden pull --yes only when the user asks.
Never read or print env values.
Ask the user to enter the master password, pairing codes and recovery secrets, and to approve checkouts, in their own terminal.
Run envden rm only when the user asks to delete that env file everywhere.
Never resolve conflicts without the user's approval. If envden config agent-merge is on, you may help edit a conflict file.
Use envden update --check freely; ask before running envden update.
