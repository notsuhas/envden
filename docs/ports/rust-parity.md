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

## presentation: recovery kit PDF serialization

- Scenario: save a recovery kit as a PDF.
- TS behaviour: pdf-lib writes one A4 page with standard fonts and pako-compressed content, including pdf-lib metadata and generated font resource names.
- Rust behaviour: lopdf writes one A4 page with the same text, fields and standard fonts, using its flate2 Rust backend. Metadata, resource names, object layout and compressed bytes differ. File naming, location, permissions and exclusive creation stay the same.
- Why: PDF internal bytes are presentation; maintained PDF and compression crates replace the byte-for-byte pdf-lib emulation and static C zlib.

## presentation: status-page storage sizes

- Scenario: view storage usage on the server's HTML status page.
- TS behaviour: pretty-bytes uses binary units and three significant digits, promoting rounded values to the next unit (`apps/server/src/status/page/format.ts`).
- Rust behaviour: humansize 2.1.3 uses binary units and two decimal places for fractional values; 1048575 bytes displays as `1024.00 KiB` instead of `1 MiB`.
- Why: this is HTML presentation only. The status JSON still contains the unchanged byte count.

## presentation: status-page elapsed times

- Scenario: view uptime or the last-prune date on the server's HTML status page.
- TS behaviour: date-fns rounds relative times to a single unit and joins uptime units with spaces (`apps/server/src/status/page/format.ts`).
- Rust behaviour: chrono-humanize 0.2.3 renders precise elapsed units with commas and `and`; chrono 0.4.45 still formats the absolute UTC date and splits uptime into calendar fields.
- Why: maintained crates own presentation. The absolute date, past/future direction and JSON timestamps stay unchanged; uptime still discards calendar months and years before rendering as documented above.

## implementation: behavior-sensitive library helpers

- CLI date formatting stays exact because `when_text` is also written to `state/repair-report-*`, and `local_time` supplies the recovery PDF's Created field. Chrono and chrono-tz already supply calendar and timezone operations.
- Discovery's p-limit equivalent already uses scoped standard-library threads. Keep its limits, result order and traversal barriers because discovered checkouts feed prompts and saved state.
- Zod equivalents use serde with custom checks. Keep acceptance, rejection, defaults, UTF-16 lengths, safe-integer limits and property order because these decide requests and persisted configuration.
- Semver parsing stays custom: the reference accepts arbitrary-size decimal components and rejects prerelease/build suffixes. The semver crate's u64 components and broader syntax would change protocol and update decisions.
- Glob matching already uses globset. Keep its options and surrounding filters because they decide which files synchronize.
- localeCompare already uses icu_collator. Keep it because ordering also determines discovery choices, takeover operations and writes.
- English integer plurals use the single `count == 1` rule. This is application wording, not a general Intl implementation; adding ICU plural rules would add no behavior for these inputs.
- JSON.stringify equivalents already use serde_json. Keep insertion order, whitespace, trailing newlines and tagged collection revival because they determine wire and file bytes; terminal sanitization remains an application policy.
- ECMAScript whitespace, Buffer-style decoding, BigInt revival, environment-file parsing and protocol encodings stay exact because they affect accepted inputs, merged files, saved state or signed bytes. Their underlying decoding and integer operations already use base64 and num-bigint.
- No CLI pretty-bytes implementation or additional npm-named library clone was found outside the separately owned parser, prompt and PDF modules. Bundled UI JavaScript remains the frozen reference asset, not a Rust library clone.


## presentation: interactive prompts and notices

- Scenario: enter text or passwords, confirm choices, select checkouts, or display an intro, outro, note, log or cancellation notice.
- TS behaviour: @clack/prompts renders its own frames, masked characters, spacing and colours on stdout.
- Rust behaviour: CliClack 0.5.7 renders its native frames and notices on stderr, including its password mask and validation layout. Prompt labels, choices, defaults, validation, keyboard decisions and cancellation outcomes stay unchanged.
- Why: a maintained prompt crate owns rendering and input. A small documented patch preserves editable defaults, existing selection keys and text editing; the CLI holds raw mode before rendering to prevent password echo.

## presentation: repository scan spinner

- Scenario: discover checkouts during setup or join with progress enabled.
- TS behaviour: @clack/prompts animates a spinner on stdout and reports the number of repos found.
- Rust behaviour: CliClack 0.5.7 uses its indicatif-backed spinner on stdout, with native animation and completion styling. The scan location, found count, singular/plural completion text and silent non-terminal default stay unchanged.
- Why: the maintained spinner replaces the custom ANSI progress renderer; discovery decisions and results stay unchanged.

## presentation: command help layout

- Scenario: request command help with `--help`, `-h` or `help <command>`.
- TS behaviour: Commander 15.1 formats grouped commands, options, arguments and usage with its own spacing and wrapping.
- Rust behaviour: clap 4.6.7 formats the same command descriptions, visible options, arguments and defaults with native usage, headings and wrapping.
- Why: maintained clap builders replace the custom help formatter and byte-exact help fixtures; command selection and help exit codes stay unchanged.

## presentation: parser errors and suggestions

- Scenario: pass unknown commands or options, missing or excess arguments, invalid choices or conflicting flags.
- TS behaviour: Commander 15.1 supplies diagnostics and edit-distance suggestions, with different newline sanitization at the root and nested commands.
- Rust behaviour: clap 4.6.7 supplies native diagnostics, usage and suggestions; compatibility checks retain accepted inputs, parsed values, validation decisions and exit codes.
- Why: maintained parsing replaces the custom Commander emulation and suggestion algorithm.

## presentation: long recovery kit instructions

- Scenario: a recovery kit includes a server URL wider than the instructions column.
- TS behaviour: pdf-lib wraps at spaces, so an unbroken URL extends beyond the page margin.
- Rust behaviour: long words wrap within the page margins; every character remains in the PDF and the server field remains intact.
- Why: PDF line wrapping is presentation, and the recovery instructions must remain readable on one page.
