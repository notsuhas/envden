# TS trim correspondence

- tailscale adapter failure stderr: adapter.ts:47 trim -> js_trim.
- tailscale serve JSON: serve/conflict.ts:16 trim before JSON.parse -> js_trim before serde JSON parsing, including BOM around JSON.
- git remote URL: repo-id/remote-url.ts:8 trim -> checkout.rs js_trim.
- git normalize: repo-id/normalize.ts:17 trim -> remote.rs js_trim; controls are rejected before this call.
- SSH hostname: repo-id/ssh.ts:12 trim -> js_trim, and its whitespace regex now excludes NEL and includes BOM.
- git checkout: checkout/checkout.ts:22,37,49 trimEnd/trim -> js_trim_end/js_trim.
- git registration: checkout/registration.ts:12,27 trimEnd -> js_trim_end.
- git ignore path: ignore/ensure-ignored.ts:24 trimEnd -> js_trim_end.
- Bash comments: files/bash-profile.ts:22 trimStart -> js_trim_start.
- suggested name: identity/name/suggested.ts:5 trim -> js_trim; BOM and NEL already removed by the preceding Cc/Cf filter, so no new observable behavior here.
- recovery input/read: input.ts:19,25,34 and read.ts:12 trim -> js_trim; BOM/NEL parse-kit regression covers validation and returned values.
- PDF instruction lines: pdf/layout.ts:114 trim -> js_trim; printable font mapping runs first, replacing unsupported characters, so no new BOM/NEL behavior here.
- service command failure: service/install.ts:82 trim -> js_trim. UID parsing is a Rust-only id subprocess replacing process.getuid; its trim was left alone.
- report fences and log tail: content/document.ts:19,34 trimEnd -> js_trim_end.
- report/facts.rs OS release trim and HTTP header parsing were left unchanged; their Rust-only call paths still need separate investigation.
