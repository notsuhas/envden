---
"@envden/cli": minor
---

Add `envden send` and `envden receive` for handing an env file to someone once.

- `envden send [file]` encrypts the file and prints a one-time link that opens in any browser, even for people without envden or access to your tailnet. It publishes only that link through Tailscale Funnel, and only while the command runs: the link closes on the first open, after `--ttl` minutes (default 10), or on Ctrl-C. Your envden server stays private.
- `envden receive <link> [file]` saves a sent file straight to disk with owner-only permissions, asking before it replaces anything.
