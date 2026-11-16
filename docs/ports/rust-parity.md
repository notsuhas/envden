# Rust port: remaining differences

`docs/implementations.md` on `main` is the canonical list of accepted differences between implementations. This file keeps the Rust-specific detail behind those entries: presentation that a maintained Rust crate owns, and library choices that must keep behaviour exact. Bugs found in any implementation are fixed in all of them and are not listed here.

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
- Rust behaviour: uptime matches the reference exactly (total days, then hours and minutes). The last-prune time uses chrono-humanize 0.2.3, which renders precise elapsed units with commas and `and`; chrono 0.4.45 formats the absolute UTC date.
- Why: maintained crates own presentation. The absolute date, past/future direction and JSON timestamps stay unchanged.

## implementation: behavior-sensitive library helpers

- CLI date formatting stays exact because `when_text` is also written to `state/repair-report-*`, and `local_time` supplies the recovery PDF's Created field. Chrono and chrono-tz supply calendar and timezone operations; no crate copies the relative-time rules: chrono-humanize writes `a month` and timeago floors, while the reference counts days on the local wall clock (2 days 11 hours before a DST change in New York reads `3 days ago`) and turns 12 months into `1 year`.
- Discovery's p-limit equivalent already uses scoped standard-library threads. Keep its limits, result order and traversal barriers because discovered checkouts feed prompts and saved state.
- Zod equivalents use serde with custom checks. Keep acceptance, rejection, defaults, code-point string lengths (zod 4.6.7 counts `😀` as one), safe-integer limits and property order because these decide requests and persisted configuration. validator and garde check fields after typed deserialization, where serde's integer types reject `5.0`, which `z.number().int()` accepts.
- Semver parsing is envden's own code: the reference accepts arbitrary-size decimal components and rejects prerelease/build suffixes. The semver crate's u64 components and broader syntax would change protocol and update decisions.
- Glob matching uses fast-glob, which shares Bun.Glob's glob-match lineage; globset treated `!.env.local` and `**/` differently. Patterns outside the shared grammar (DESIGN § Decisions, "Env-file patterns use one proven grammar") are refused. fast-glob matches per byte, so each non-ASCII code point is mapped to one byte no pattern literal can match, which makes `?` match exactly one code point.
- localeCompare uses icu_collator's root collation, which matches Bun's fixed en-US collator whatever `LANG` says. Ordering determines discovery choices, takeover operations and writes.
- English integer plurals use the single `count == 1` rule. This is application wording, not a general Intl implementation; adding ICU plural rules would add no behavior for these inputs.
- JSON uses serde_json, with a formatter that writes floats through ryu-js as Number#toString does (`100`, where serde_json writes `100.0`). Keep insertion order, whitespace, trailing newlines and tagged collection revival because they determine wire and file bytes; terminal sanitization remains an application policy. serde_json still rejects `1e400` and keeps integers above 2^53 exact, where JSON.parse yields Infinity and rounds; only hand-edited files reach this.
- ECMAScript whitespace, Buffer-style decoding, BigInt revival, environment-file parsing and protocol encodings stay exact because they affect accepted inputs, merged files, saved state or signed bytes. Their underlying decoding and integer operations already use base64 and num-bigint. The env-file parser is envden's own format; dotenvy would drop `# KEY=v` lines, which merge keeps as inactive entries, and expand `${A}`.
- No CLI pretty-bytes implementation or additional npm-named library clone was found outside the separately owned parser, prompt and PDF modules. Bundled UI JavaScript remains the frozen reference asset, not a Rust library clone.

## presentation: interactive prompts and notices

- Scenario: enter text or passwords, confirm choices, select checkouts, or display an intro, outro, note, log or cancellation notice.
- TS behaviour: @clack/prompts renders its own frames, masked characters, spacing and colours on stdout.
- Rust behaviour: CliClack 0.5.7 renders its native frames and notices on stderr, including its password mask and validation layout. Given the same answers, the same prompts appear in the same order with the same choices and defaults, and Enter, Ctrl-C, Ctrl-D and Escape submit or cancel with the same outcome and exit code.
- Keystrokes: key bindings, in-prompt line editing and typed-ahead handling are CliClack's and the console crate's, not readline's. Known differences: Ctrl-U clears the whole line rather than the text before the cursor; Ctrl-B/F/K/Y and readline's undo, kill ring and history are not bound; Ctrl-W and Alt word keys follow CliClack's word rules and do nothing in password prompts; Ctrl-P/N move through select lists; space doesn't toggle a confirm; `a`, `i` and Ctrl-A don't select or invert checkboxes; lists stop at the ends instead of wrapping; Escape followed quickly by another key may read as an Alt chord; Ctrl-Z doesn't suspend the process; on Windows, a prompt with both stdout and stderr redirected fails as non-interactive instead of reading the console.
- Why: keystroke mechanics are presentation. A maintained prompt crate owns rendering and input; the small patch in `rust/vendor/cliclack/ENVDEN-PATCH.md` changes only what decides a prompt's outcome. The CLI holds raw mode before rendering to prevent password echo.

## presentation: repository scan spinner

- Scenario: discover checkouts during setup or join with progress enabled.
- TS behaviour: @clack/prompts animates a spinner on stdout and reports the number of repos found.
- Rust behaviour: CliClack 0.5.7 uses its indicatif-backed spinner on stdout, with native animation and a plain completion line. Completion counts remain visible even when the animation is hidden. The scan location, found count, singular/plural completion text and silent non-terminal default stay unchanged.
- Why: the maintained spinner replaces the custom ANSI progress renderer; discovery decisions and results stay unchanged.

## presentation: command help layout

- Scenario: request command help with `--help`, `-h` or `help <command>`.
- TS behaviour: Commander 15.1 formats grouped commands, options, arguments and usage with its own spacing and wrapping.
- Rust behaviour: clap 4.6.7 formats the same command descriptions, visible options, arguments and defaults with native usage, headings and wrapping.
- Why: maintained clap builders replace the custom help formatter and byte-exact help fixtures; command selection and help exit codes stay unchanged.

## presentation: parser errors and suggestions

- Scenario: pass unknown commands or options, missing or excess arguments, invalid choices or conflicting flags.
- TS behaviour: Commander 15.1 supplies diagnostics and edit-distance suggestions.
- Rust behaviour: clap 4.6.7 supplies native diagnostics, usage and suggestions; compatibility checks retain accepted inputs, parsed values, validation decisions and exit codes. Both keep the diagnostic's own line breaks and strip control characters from echoed arguments at every command depth.
- Why: maintained parsing replaces the custom Commander emulation and suggestion algorithm.
