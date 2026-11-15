---
"@envden/cli": patch
"@envden/server": patch
---

Fewer ways to get confused:

- Setup and repair tokens are one word, so a double-click copies all of it, and the server labels them. `envden setup --host-server` no longer asks for one.
- Server addresses, tokens, recovery keys and pairing codes are checked as you enter them, before the password. A bare host works anywhere an address is asked for. The pairing code is visible while you type it.
- Server errors say what went wrong and what to run next. Push and pull ask for the master password when the unlock has expired. A wrong password or a mismatched confirmation asks again.
- `push`, `pull`, `diff`, `resolve`, `doctor` and `config` print plain text; `--json` gives JSON. The recovery kit prints as a labelled block and waits until you've saved it.
- Tailscale and keychain problems name the cause and the fix. Setup won't replace another service on port 443.
- Plain words replace protocol terms in help, messages and docs.
