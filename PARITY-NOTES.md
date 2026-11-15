# Parity notes

Differences between implementations that we keep on purpose, and TS bugs to fix everywhere. Each entry: scenario, TS behaviour, possible improvement, why.

## SQLite keyring quota timing

- Scenario: a swap grows keyring state while an active vault is already at its quota.
- TS behaviour: quota is checked before state writes, so keyring growth commits even though keyring bytes count toward usage. Rust preserves that order.
- Possible improvement: check quota after state writes while preserving the deletion-only exemption.
- Why: enforcing it only in Rust would reject swaps accepted by the TS server. BUG: fix in all implementations.

## Rust adapter platform coverage

- Scenario: building the placement/fs, repo/git or shell/rc adapter for Windows.
- TS behaviour: uses filesystem fallbacks and Windows ACL/owner checks instead of Unix descriptors and metadata.
- Possible improvement: port those Windows branches before claiming cross-platform parity. These Rust crates currently use Unix filesystem APIs; tests cover macOS only.
- Why: Windows parity remains incomplete; the Unix implementation must not be treated as proof of Windows support.
