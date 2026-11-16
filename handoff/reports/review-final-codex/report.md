# Findings

## Low — duplicate query parameters choose different values — CONFIRMED

- Rust: rust/server/src/routes/reads.rs:36-39, consumed at :59-60.
- TypeScript: apps/server/src/routes/data/reads.ts:45-48.
- Scenario: an authenticated GET /v1/headers?from=1&to=999&to=0 returns 200 in TypeScript because Hono takes the first `to`, but Rust returns 400 INVALID_INPUT because collecting pairs into HashMap keeps the last `to`. Duplicate `from` also returns a different history page. The same last-value collection appears in rust/server/src/routes/authenticated.rs:88-91 for the swap mailbox query; TypeScript reads that query at apps/server/src/routes/data/vault.ts:20.
- Fix: use first-value query lookup consistently, matching Hono, and add duplicate-parameter response cases for headers/entries and swap mailbox selection.
- Proof: query-endpoint.rs executes the real Rust app with the existing signed-request/SQLite fixture. query.ts executes Hono and the real TypeScript readRange function with a fake storage adapter. query.rs separately reproduces the exact Rust parsing expression. The Rust endpoint produced 400 {"error":"INVALID_INPUT"}; Hono produced 200 {"objects":["MQ"]}. No authentication bypass was observed.

# Areas checked without another finding

- Request signatures and mirrored bindings, strict time boundary, nonce replay, member/nonmember route policy, proof checks and rate-limit charging/refunds.
- Swap operation shapes and authorization, head CAS and retry digests, repair token restrictions/finishing login, staged registration, move freeze/import checks.
- Canonical Ed25519/X25519 validation and strict cofactored signature acceptance, HPKE contexts and low-order rejection, AEAD contexts, fixed Argon2 parameters and OPAQUE message lengths, constant-time token-proof verification, recovery-key zeroization.
- Manifest linkage/signature/file/keyring validation and removal/rollback/fork/repair-drop classification, compared with the reference source.
- Unix placement traversal checks, descriptor-relative writes/removal, symlink refusal, private backups and preservation of unrelated contents.
- README and Rust runtime source scanned for user-visible TypeScript/port/parity references. No violation found; network-port wording and test-only references were excluded.

# Validation and limits

124 tests passed: 15 protocol, 28 server unit, 16 server body/protocol/restoration integration, 59 server endpoint cases, 6 placement safety/path tests. This corrects the earlier commentary total of 125.

All Cargo calls used CARGO_INCREMENTAL=0 and CARGO_TARGET_DIR=$PWD/target/sweep. Scratch source/notes are only under /tmp/review-final-codex; scratch executables are under target/sweep. No checkout source edits or git mutations were made. Other agents changed documentation during the review.

This is a targeted review, not exhaustive proof. No Windows runtime validation, full CLI black-box suite or live network exhaustion test was performed. The latest intentional-bug list read was docs/ports/rust-parity.md. Known in-progress fixes from the brief were excluded.
