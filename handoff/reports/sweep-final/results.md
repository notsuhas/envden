# Sweep results

Head: 38ae2d9d9719b8efa2ae9a620ca65934d9c265f1

- Inventory: 106 PENDING before, 0 PENDING after; 106 ordered comparisons.
- Fix commits: 15, each pushed immediately; branch tracks origin/port/rust and has no outstanding changes.
- cargo fmt --all: passed.
- cargo clippy --workspace --all-targets -- -D warnings: passed.
- cargo test --workspace: 695 tests passed, zero failures.
- cargo check --tests --target x86_64-pc-windows-gnu -p envden-cli: passed without warnings, using the local Zig compiler wrapper.
- cargo build --release -p envden-cli: passed.
- TS/Rust parity: 24/24 scenarios passed.
- Rust CLI e2e: passed.
- UI assets: HTML, JS and CSS byte-identical to a fresh frozen TS build.

Logs: verified-*.log in this directory. Protected-owner gaps: fixes.md. Ordered source comparison: checklist.md. Frozen TypeScript and protected-owner files were not edited by this sweep.
