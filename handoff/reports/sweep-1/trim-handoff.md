# ECMAScript trim handoff

Shared helpers: `envden_core::text::{js_trim, js_trim_start, js_trim_end}`. FEFF is whitespace; 0085 is preserved. Use only where the TS reference trims, including JS Number string conversion.

Outside this agent's ownership, confirmed TS trim counterparts:

- rust/adapters/network/tailscale/src/adapter.rs: stderr trim.
- rust/adapters/network/tailscale/src/serve.rs: stdout trim before JSON parse.
- rust/adapters/repo/git/src/remote.rs: remote normalization and hostname trim.
- rust/adapters/repo/git/src/ignore.rs: git path trimEnd.
- rust/adapters/repo/git/src/checkout.rs: remote/get-url trim, remotes trim, git-common-dir/git-dir/backlink trimEnd.
- rust/adapters/shell/rc/src/profile.rs: line trimStart before comment check.
- rust/protocol/src/protocol/pairing/code.rs: pairing input trim. This crate already depends on core, so it can use the shared helper.
- rust/cli/src/identity/name/suggested.rs: host and fitted-name trim.
- rust/cli/src/state/lock/{process,owner}.rs: process output/boot-id trim where paired to TS state/lock/process.ts.
- rust/cli/src/vault/recovery/input.rs: secret/vault-id trim.
- rust/cli/src/vault/recovery/read.rs: secret/vault-id trim.
- rust/cli/src/vault/recovery/pdf/layout.rs: wrapped line trim.
- rust/cli/src/onboarding/vault/{pending_kit,token}.rs and onboarding/decisions.rs: recovery secret/setup token/server-address trim.
- rust/cli/src/agent/service/system.rs: service stderr trim.
- rust/cli/src/report/content/document.rs: fenced text and log tail trimEnd.

Do not replace every Rust trim blindly: report/facts.rs, onboarding/setup.rs hostname discovery, and HTTP wire header parsing have Rust-only trimming and require separate reference tracing.

Also inspect Rust regex use corresponding to JS `\\s` in core merge/parser/layout and release checksums. This handoff only changes owned explicit trim call sites.
