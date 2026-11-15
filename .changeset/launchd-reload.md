---
"@envden/cli": patch
---

`envden setup --host-server` on macOS waits for launchd to finish unloading the old server before loading the new one, instead of failing with "Could not install the envden login service". If loading still fails, the message includes launchd's own error.
