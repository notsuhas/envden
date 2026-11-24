---
"@envden/cli": minor
---

**Breaking:** onboarding now uses one recovery code and word approval, and the master password is gone. Setup asks only for the server, the setup token and a device name, then shows a recovery code once for your password manager. New devices run `envden join <server>` and are approved with `envden device approve` after both screens show the same three words; `envden join --recovery` uses the code when every device is lost, and `envden vault recovery-code` replaces it. `envden unlock`, `envden device add`, `vault kit replace`, `vault password change|reset`, `config unlock-period`, the PDF kit and pairing codes are removed. Vaults created by 0.3.x can't be opened: re-run setup.
