---
"@envden/cli": patch
---

`envden setup --host-server` publishes the server on its own port, `https://<machine>.<tailnet>.ts.net:4783`, instead of taking the machine's main HTTPS address from other apps. If port 4783 is busy, it picks a free one.
