---
"@envden/cli": patch
"@envden/server": patch
---

Fixes found while matching the Go and Rust ports:

- Device names with a newline, tab or other control character are refused up front with the usual device-name message.
- Ctrl-D cancels a prompt like Ctrl-C instead of hanging.
- `envden server switch` asks for your master password and logs in at the new server when it has no session for this device, instead of failing with "Unlock expired".
- After `envden device add`, the success line names the device that was actually added, even if another device took the confirmed name first.
- Mistyped commands and options print the "(Did you mean ...?)" hint on its own line, and control characters from your arguments are stripped from every parser error.
- An empty `ENVDEN_HOME` now means `~/.envden` instead of the current folder.
- `history --restore` refuses version numbers too large to read exactly instead of rounding them.
- Aliases work for repo IDs like `constructor` or `__proto__`.
- Env-file patterns are limited to `*`, `?`, `**`, `{a,b}` groups and a leading `!`; anything else fails with "Unsupported env file pattern" before push or pull writes.
- A long server URL in the recovery kit wraps inside the page margins.
- `server repair` reports a missing key for an earlier epoch as invalid data instead of a JavaScript error.
- The server answers HEAD requests on GET routes, closes idle connections after 10 seconds, shows uptime past a month in days, handles a stop signal right after it starts, and leaves only `envden.sqlite` behind when it stops.
