---
"@envden/cli": patch
---

Rerunning `envden setup --host-server` keeps the server's port instead of moving it away from what Tailscale and your devices use. On Windows, the server's scheduled task now runs on battery, has no 72-hour limit and restarts after a failure, `envden update` keeps a non-default port, and the server's key and database are restricted to your user.

`envden serve` no longer creates CLI state in your home folder or checks for notices from the server it is starting.
