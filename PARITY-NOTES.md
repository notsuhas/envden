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

## Listening is printed before shutdown handlers are ready

- Scenario: send SIGTERM immediately after the server prints its listening URL.
- TS behaviour: the signal can arrive before shutdown handlers are installed, producing exit 143 instead of a graceful shutdown. Rust preserves the startup ordering.
- Possible improvement: install shutdown handlers before advertising readiness.
- Why: process managers and fast tests can otherwise terminate a newly listening server without closing storage. BUG: fix in all implementations.

## Pairing success prints the proposed name after a race

- Scenario: confirm `Add mainbook-2?`, then another device takes that name before the approval commits.
- TS behaviour: the head retry commits the joiner as `mainbook-3`, but the success message still says `Device mainbook-2 added`. Rust preserves the confirmed name in that message.
- Possible improvement: return the committed name from approval and use it in the success message.
- Why: the current message can identify a different device after a concurrent add. BUG: fix in all implementations.

## Repair with an absent epoch key

- Scenario: repair needs a file name or recovery blob from an epoch absent from its keyring.
- TS behaviour: the unchecked map lookup reaches the fixed-byte codec and throws `undefined is not an object (evaluating 'v.length')` in Bun. Rust returns an error with that message instead of panicking.
- Possible improvement: validate key availability and return a deliberate protocol error.
- Why: changing the TS failure requires a coordinated fix. BUG: fix in all implementations.

## Nested parser errors preserve terminal controls

- Scenario: pass an unknown option containing ESC bytes to a subcommand, such as `device ls`.
- TS behaviour: Commander writes those bytes directly to stderr; the root error sanitizer does not cover subcommands. Rust preserves those bytes.
- Possible improvement: sanitize user-controlled parser values while preserving diagnostic line breaks.
- Why: terminal escape sequences in arguments can alter the terminal display. BUG: fix in all implementations.
