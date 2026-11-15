# Parity notes

Differences between implementations that we keep on purpose, and TS bugs to fix everywhere. Each entry: scenario, TS behaviour, possible improvement, why.

## SQLite keyring quota timing

- Scenario: a swap grows keyring state while an active vault is already at its quota.
- TS behaviour: quota is checked before state writes, so keyring growth commits even though keyring bytes count toward usage. Rust preserves that order.
- Possible improvement: check quota after state writes while preserving the deletion-only exemption.
- Why: enforcing it only in Rust would reject swaps accepted by the TS server. BUG: fix in all implementations.

## Root command suggestion line breaks

- Scenario: `envden statu` versus `envden device list`.
- TS behaviour: the root command sanitizes the error and removes the newline before its suggestion; subcommands preserve the newline. Rust keeps this difference.
- Possible improvement: preserve line breaks in trusted parser diagnostics while sanitizing user-controlled text.
- Why: root suggestions currently run into the preceding sentence. BUG: fix in all implementations.
