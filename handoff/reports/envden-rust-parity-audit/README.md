# Audit status

INCOMPLETE: 474 expanded TS cases inventoried. Only 112 cases have complete mappings; other rows are candidates, partial mappings, or strengthened cases whose entire assertion set has not been certified. No production Rust bug was confirmed or fixed.

Validation: cargo fmt for the nine assigned packages; exact requested Clippy command with -D warnings; 189 Rust tests passed, zero failures/ignored/warnings. TS merge suite: 42 tests, 2906 assertions, all pass. Forty merge/marker cases map to 1059 exact-input vector assertions, plus two decision cases map directly.

Main remaining work:

- Protocol: manifest epoch rotations/keyring defects, longer and sibling forks/foreign genesis, repair crossing/no-fast-forward, historical signature ancestry, removed actor after repair, recovery authority/replacement, swap request/entry binding and optional payload shape matrices, OPAQUE entrypoint shape validation.
- Core: renamed/separate-git-dir executable resolution, exact environment allowlist inputs and runtime execution. The commit preconditions case is mapped in envden-testing rather than envden-core.
- Git: global/local URL rewrites and safe.directory isolation, batching, old-Git worktree fallback, SSH argv safety, case alias inputs, executable config and embedded bare repo checks.
- Placement/shell: deterministic adversarial filesystem race tests, fallback/native injected-failure paths, linked parent folders, shell caching/notification execution, PowerShell resolver injection/output validation, Windows ACLs.
- SQLite: existing Rust tests match scenario names but no complete assertion-by-assertion audit was performed. All remain candidate mappings.

Do not interpret strengthened/candidate/partial rows as completed parity. Windows-only assertions require a Windows run. Tests use temp dirs, and fixture temp dirs have been dropped. Scripts and reports live outside the repository.
