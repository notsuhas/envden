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

## Status uptime drops calendar months and years

- Scenario: the server has been running for 32 days.
- TS behaviour: the status page displays `1 day`; date-fns splits the interval into calendar months and days, then the formatter omits months and years. Rust preserves that result.
- Possible improvement: format elapsed days, or include months and years.
- Why: long uptimes currently look much shorter than they are. BUG: fix in all implementations.

## Device names allow control characters

- Scenario: rename a device to a name containing a newline or tab.
- TS behaviour: name validation rejects Unicode format characters but allows control characters; Rust preserves it.
- Possible improvement: reject control characters alongside format characters.
- Why: a name advertised as having no invisible characters can still contain them. BUG: fix in all implementations.

## HEAD requests to GET endpoints return 404

- Scenario: send HEAD to `/`, `/v1/status` or `/v1/hello`.
- TS behaviour: Hono selects the GET handler, but the method policy rejects HEAD. The response is an empty 404, including status-page security headers where applicable. Rust preserves the wire response.
- Possible improvement: allow HEAD on public GET endpoints and return their normal headers without a body.
- Why: HEAD-based health checks currently report a healthy server as unavailable. BUG: fix in all implementations.
