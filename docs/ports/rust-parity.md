# Rust port parity notes

TS bugs the Rust port copies on purpose, and places where a better option exists but parity wins; each entry names the TS source it was checked against.

## protocol: Device names allow control characters

- Scenario: rename a device to a name containing a newline or tab.
- TS behaviour: `isDeviceName` rejects Unicode format characters but not control characters (`packages/core/src/protocol/codecs/members/device-name.ts:6`). The string codec rejects them later, when the entry is signed, as `Invalid string` (`encoding/strings.ts:6`), not as the device-name message in `apps/cli/src/admin/devices/rename.ts:40-43`.
- Possible improvement: reject control characters in `isDeviceName` so the user gets the intended message.
- Why: the name check and the codec disagree, so the error is generic. BUG: fix in all implementations.

## server: SQLite keyring quota timing

- Scenario: a swap grows keyring state while an active vault is already at its quota.
- TS behaviour: the quota is checked before keyring state is written (`packages/adapters/storage/sqlite/src/chain/swap-commit.ts:61`, then `:63`), yet keyring bytes count toward usage (`db/quota.ts:15`). The growth commits.
- Possible improvement: check the quota after state writes, keeping the deletion-only exemption.
- Why: enforcing it only in Rust would reject swaps the TS server accepts. BUG: fix in all implementations.

## server: HEAD requests to GET endpoints return 404

- Scenario: send HEAD to `/`, `/v1/status` or `/v1/hello`.
- TS behaviour: routes match on the exact method (`apps/server/src/routes/policy.ts:86`), so HEAD finds none and gets an empty 404, with the status-page security headers where they apply.
- Possible improvement: serve HEAD on public GET endpoints with the normal headers and no body.
- Why: HEAD health checks report a healthy server as down. BUG: fix in all implementations.

## server: listening is printed before shutdown handlers exist

- Scenario: send SIGTERM right after the server prints its listening URL.
- TS behaviour: the URL is printed at `apps/server/src/main.ts:74` and the SIGTERM/SIGINT handlers are installed at `:95-96`. An early signal ends the process with exit 143 and no graceful shutdown.
- Possible improvement: install the handlers before printing the URL.
- Why: process managers and fast tests can stop a listening server without closing storage. BUG: fix in all implementations.

## server: status uptime drops months and years

- Scenario: the server has been up for 32 days.
- TS behaviour: the status page shows `1 day`. `intervalToDuration` splits 32 days into 1 month and 1 day, and the formatter only keeps days, hours and minutes (`apps/server/src/status/page/format.ts:10-17`).
- Possible improvement: format total elapsed days, or include months and years.
- Why: long uptimes look much shorter than they are. BUG: fix in all implementations.

## server: idle connection timeout

- Scenario: open a connection and send nothing, or send partial headers.
- TS behaviour: `Bun.serve` runs with its default 10 s idle timeout (`apps/server/src/main.ts:55-67`), and in practice Bun closes the connection after about 12 s.
- Possible improvement: none needed; this is timing, not a bug.
- Why: Rust closes at exactly 10 s. No bytes on the wire differ.

## CLI sync: repair with an absent epoch key

- Scenario: repair needs a file name or recovery blob from an epoch missing from the keyring.
- TS behaviour: `keys.get(epoch)!` returns `undefined` (`apps/cli/src/admin/repair/lost.ts:56,78`, `completion/names.ts:20`). The fixed-length codec then throws `undefined is not an object (evaluating 'v.length')` in Bun (`packages/core/src/protocol/encoding/binary.ts:71`). Rust returns an error with that message instead of panicking.
- Possible improvement: check key availability and raise a deliberate protocol error.
- Why: changing the failure means changing every implementation together. BUG: fix in all implementations.

## CLI pairing: success message names the confirmed device name

- Scenario: confirm `Add mainbook-2?`, then another device takes that name before the approval commits.
- TS behaviour: the head retry commits the joiner as `mainbook-3`, but the message is built from the name that was confirmed (`apps/cli/src/onboarding/add.ts:70-75,80`, `output/render/devices/devices.ts:28-31`), so it says `Device mainbook-2 added`.
- Possible improvement: return the committed name from the approval and print that.
- Why: after a concurrent add the message names a different device than the one added. BUG: fix in all implementations.

## output: root command suggestion line break

- Scenario: `envden statu` compared with `envden device list`.
- TS behaviour: the root command sanitizes parser errors with `sanitizeTerminal`, which strips every control character including the newline before the suggestion (`apps/cli/src/program.ts:43`, `output/sanitize.ts:3`). Subcommands keep the newline.
- Possible improvement: keep line breaks in parser diagnostics and sanitize only the user-supplied text.
- Why: the suggestion runs into the preceding sentence. BUG: fix in all implementations.

## output: nested parser errors pass terminal control bytes

- Scenario: pass an unknown option containing ESC bytes to a subcommand, such as `device ls`.
- TS behaviour: only the root command sets `configureOutput` (`apps/cli/src/program.ts:43`), so Commander writes subcommand errors to stderr unsanitized.
- Possible improvement: sanitize user-supplied parser values on every command and keep the diagnostic line breaks.
- Why: escape sequences in arguments can rewrite what the terminal shows. BUG: fix in all implementations.

## CLI aliases: inherited object properties affect aliases

- Scenario: alias `x` to `constructor`, `toString`, `hasOwnProperty` or another inherited object property; alias `__proto__` to `x`.
- TS behaviour: `deriveAlias` reads inherited properties of the plain `state.aliases` object and rejects those targets as alias chains. Assigning a string to an absent own `__proto__` property invokes the inherited setter, so the command reports success but saves no alias (`apps/cli/src/links/alias.ts`). Own properties shadow inherited properties, including an own `__proto__` loaded from JSON.
- Possible improvement: use a prototype-free dictionary and check own properties explicitly.
- Why: repo IDs can collide with object internals, rejecting valid targets or silently discarding an alias. BUG: fix in all implementations.
