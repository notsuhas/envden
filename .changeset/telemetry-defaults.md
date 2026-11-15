---
"@envden/cli": patch
---

Telemetry works: events are sent by a short background process after each command, so they arrive and commands never wait on the network. Before, a 200 ms limit cut every request off. Interactive setup now has Yes selected for telemetry and the agent skill; `--yes` and runs without a terminal still leave telemetry off. The background sender passes on proxy and CA settings, and no longer reads or clears notices meant for you, such as a device joining with the recovery kit.
