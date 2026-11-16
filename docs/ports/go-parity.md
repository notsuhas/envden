# Parity notes

Known gaps and TS bugs found while porting envden to other languages. Each implementation copies the TS behaviour until the item is fixed.
Fixes land in every implementation in the same PR, never in one alone (see [go.md](go.md)).
There is one entry per gap: what happens, the TS behaviour, the fix we want, why, and whether TS is wrong.

## runtime: native error text

Scenario: a trusted executable passes validation but fails to start, a filesystem operation fails outside an `EnvdenError` boundary, or the server logs an unexpected error.

TS behaviour: Bun/Node exposes its own errno wording and syscall/path format, and server logs carry Bun stack frames.

Possible improvement: define fixed messages for these failures and shared structured server diagnostics in every implementation.

Why: Go returns its native OS error text and logs a sanitized internal error. Typed Envden errors, protocol error bodies and normal output keep the exact bytes and codes; raw errno text and stack frames don't.

Bug-in-TS: no

## runtime: HTTP transport framing

Scenario: compare raw HTTP/1 framing, including malformed requests rejected before routing.

TS behaviour: Bun emits headers in insertion order and uses its own connection-close and missing-Host diagnostics.

Possible improvement: specify semantic HTTP parity separately from runtime-owned framing.

Why: net/http controls header order, early malformed-request responses and connection reuse. For absolute-form requests it replaces `r.Host` with the request-target authority and drops the original Host header before the handler runs. HTTP/1.1 without Host is rejected before routing; HTTP/1.0 without Host returns 404, as in Bun. Go sends 100 Continue before routing, including before body-size rejection, and HEAD sends `Content-Length: 0`, both matching Bun. Copying the rest would need a custom HTTP parser. Route status, content type and body must still match.

Bug-in-TS: no

## protocol: library diagnostic text

Scenario: syntactically valid OPAQUE messages fail library deserialization or authentication, or HTTP JSON fails a schema.

TS behaviour: exposes serenity-kit/opaque-ke or Zod diagnostic text. A wrong-password client login returns undefined.

Possible improvement: standardize library diagnostics at the protocol boundary.

Why: Go keeps every explicit `requireValue` and `EnvdenError` message, but bytemare errors use their own text and schema decoding reports `INVALID_DATA` with "Invalid protocol data". A wrong-password client login returns `OK=false` with no error.

Bug-in-TS: no

## protocol: HPKE vector test method

Scenario: reproducing the stored HPKE wraps with a fixed ephemeral seed.

TS behaviour: `sealWrap` accepts an injected RNG, so tests get deterministic ciphertexts; production uses fresh randomness.

Possible improvement: none needed; this is a test-method difference only.

Why: Go 1.26 `crypto/hpke` can't take an injected ephemeral key, so Go opens both stored vectors and checks their ephemeral public keys. `SealWrap` has no RNG parameter. Production wire behaviour matches.

Bug-in-TS: no

## protocol: "strict" Ed25519 verification is cofactored

Scenario: a signature whose R has a small-order component, for example the order-two point, with a canonical encoding and S < L.

TS behaviour: noble's `verify` with `zip215: false` accepts it, because noble always checks the cofactored equation; the flag only rejects noncanonical encodings. PROTOCOL.md § 1 calls this "strict verification", which reads as cofactorless.

Possible improvement: state the equation in PROTOCOL.md, and decide whether v1 should reject small-order R.

Why: implementations that read "strict" as cofactorless split on which chains are valid. Go matches noble (`ed25519consensus` plus the canonical-encoding checks), with the reviewer's vector as a test.

Bug-in-TS: no (spec wording)

## unicode: normalization table versions

Scenario: a string uses Unicode 16 or 17 normalization mappings absent from x/text's Unicode 15 tables.

TS behaviour: Bun ICU 78.1 normalizes U+105D2 U+0307 to U+105C9, rejecting the decomposed string in the str codec. NFKC maps U+1CCF0 to ASCII 0 and U+1CCD6 to ASCII A, so password pw𜳰𜳖 becomes pw0A.

Possible improvement: use the same Unicode table version in every runtime.

Why: x/text v0.44.0 selects Unicode 15 tables on Go 1.26, and rejecting new characters would also break TS parity, so Go keeps x/text until matching tables exist. An exhaustive scalar scan found 57 differing decomposition mappings: U+A7F1, U+105C9, U+105E4, U+11383, U+11385, U+1138E, U+11391, U+113C5, U+113C7..U+113C8, U+16121..U+16128, U+16D68..U+16D6A, and U+1CCD6..U+1CCF9. Their decomposed sequences also affect NFC checks.

Bug-in-TS: no

## unicode: case table versions

Scenario: case mapping uses Unicode 16 or 17 additions.

TS behaviour: Bun ICU 78.1 applies Unicode 17 casing. An exhaustive single-scalar comparison against x/text v0.44.0 found 110 differing scalars: U+019B, U+0264, U+1C89..U+1C8A, U+A7CB..U+A7CF, U+A7D2..U+A7D5, U+A7DA..U+A7DC, U+10D50..U+10D65, U+10D70..U+10D85, U+16EA0..U+16EB8, U+16EBB..U+16ED3.

Possible improvement: use the same Unicode table version in every runtime.

Why: Go keeps x/text's full and context-sensitive mappings, including dotted I and final sigma, but its Unicode 15 tables lack these newer pairs.

Bug-in-TS: no

## date-fns: fractional mean-year truncation

Scenario: `milliseconds({ years: 1 })` or `milliseconds({ months: 3 })`.

TS behaviour: returns 31556951999 or 7889237999 milliseconds, keeping floating-point truncation. Go matches.

Possible improvement: round these durations to the nearest millisecond.

Why: multiplying the mean-year constant lands just below an integer.

Bug-in-TS: yes

## cli: empty ENVDEN_HOME selects the working directory

Scenario: `ENVDEN_HOME` is set to an empty value.

TS behaviour: the nullish fallback keeps the empty string and resolves it to the working directory. Go matches.

Possible improvement: reject an empty override or use the default home.

Why: an empty environment variable unexpectedly puts state in the working directory.

Bug-in-TS: yes

## cli: raw subcommand parse errors

Scenario: `rm --yesx .env`, or an unknown subcommand option containing terminal escapes.

TS behaviour: only the root command sanitizes parse errors. Subcommands print raw errors, including terminal escapes, and keep the suggestion on its own line. Go matches.

Possible improvement: sanitize error output on every command, keeping the line break before suggestions.

Why: an untrusted argument can inject terminal control sequences into stderr.

Bug-in-TS: yes

## history: large version numbers round to JavaScript precision

Scenario: `history --restore 9999999999999999 .env`.

TS behaviour: the parser accepts sixteen digits and converts them with `Number`, giving version 10000000000000000. Go keeps that rounding.

Possible improvement: reject versions above `Number.MAX_SAFE_INTEGER`.

Why: a requested version can otherwise select a different number.

Bug-in-TS: yes

## aliases: inherited Object.prototype names

Scenario: an alias target is `constructor`, `__proto__` or another inherited `Object.prototype` property, or the source is `__proto__`.

TS behaviour: an inherited target fails with "Alias chains are not allowed"; assigning a string to `__proto__` saves no alias. Go matches for the standard `Object.prototype` properties.

Possible improvement: use own-property checks and a prototype-free alias map.

Why: valid repo IDs should not depend on JavaScript object inheritance.

Bug-in-TS: yes

## status: approval sometimes reported missing right after a takeover

Scenario: `parity/symlink-takeover`, step 4 (`status --json` on device a, run by the TS binary on both sides of a mixed run) on a heavily loaded machine.

TS behaviour: once in five runs, the file showed `held-back` with "checkout needs approval; run envden track" instead of `changed`, although `track` had just approved the checkout. Reruns passed every time, so it depends on timing, not on the server implementation.

Possible improvement: find the timing input (likely the checkout identity or a cached notice refreshed by a detached process) and make status deterministic.

Why: status must not flip under load, and the parity suite needs every scenario to be deterministic.

Bug-in-TS: likely; not yet reproduced on demand

## server switch: destination unlock required after move

Scenario: `parity/server-move` creates two devices, moves the server with device A, stops the source, then switches device B to the destination.

TS behaviour: device B's `server switch <destination>` exits 1 with "Unlock expired. Run envden unlock". The destination has no unlocked session for B, and switch reads history before changing B's configured address.

Possible improvement: authenticate to the destination during switch before reading its history.

Why: unlocking against B's configured source can't unlock B on the destination, especially after the source is stopped.

Bug-in-TS: yes

## server storage: WAL files after shutdown depend on the platform

Scenario: `envden serve` stops on SIGTERM.

TS behaviour: Bun links Apple's SQLite on macOS, which keeps an empty `envden.sqlite-wal` and the `-shm` file after the database closes (persistent WAL). On Linux Bun bundles its own SQLite, which removes them. So the data folder differs by platform.

Possible improvement: checkpoint and remove WAL files on shutdown everywhere, so a stopped server leaves one file.

Why: a backup taken right after shutdown on macOS needs all three files. Go matches the split on darwin only: `SQLITE_FCNTL_PERSIST_WAL`, plus a truncating checkpoint on close, since Apple empties the kept WAL.

Bug-in-TS: no

## testing storage: memory refunds retain rate strikes

Scenario: charge a memory bucket five times, refund a charge, then charge five times after the receipt window expires.

TS behaviour: the memory fake resets the lock deadline but keeps strikes, so the next lock lasts 30 minutes. SQLite resets both and locks for 15 minutes. Go keeps this difference.

Possible improvement: reset memory strikes on refund to match persistent storage.

Why: tests using the memory fake can predict a different lockout than production.

Bug-in-TS: yes


## harness: functional terminal and PDF parity

Scenario: compare two CLI implementations with different terminal libraries or PDF writers.

TS behaviour: the harness previously compared normalized terminal text and opaque PDF bytes. It now compares terminal facts, prompt order, choices and answers. JSON values stay strict, help compares command and option sets, and PDFs compare extracted text and Info fields except dates and ID. Exit codes, normalized file names and contents, modes, symlinks, state/config files and server database dumps keep their existing exact comparison.

Possible improvement: extend fact and prompt recognition alongside new CLI vocabulary and scenarios.

Why: native presentation may differ while decisions, facts and persistent effects must match. This replaces the previous presentation-identical rule; it changes no CLI behaviour.

Bug-in-TS: no

## harness: TS baseline differs under concurrent load

Scenario: run setup-interactive and pairing-sync against two copies of the same TS binary while concurrent test jobs drive host load above 150.

TS behaviour: one full-run setup exceeded the server's 15-second startup deadline. A focused setup rerun completed but the server nonce table had 38 rows on one side and 37 on the other, with different canonical labels for entry and blob hashes. Pairing also showed file-ID label differences. The full 18/18 baseline is not verified by this run.

Possible improvement: investigate the extra request and stabilize scenario coordination without filtering nonce rows or weakening database comparison.

Why: terminal presentation equivalence must not hide persistent-state differences. Minute/hour history durations now normalize like seconds; nonce counts remain exact.

Bug-in-TS: unknown

## prompts: key handling inside a prompt is native

Scenario: keys pressed inside a question, rather than the answers they produce.

TS behaviour: clack reads keys through Node's readline. Tab does nothing; `k`, `j`, `h`, `l`, Space and Ctrl-J toggle a yes/no question; `a` selects or clears every checkout and `i` inverts the selection; Ctrl-J clears a text answer; readline's word rules apply to Ctrl-W and Alt-B; Up recalls a rejected answer. Keys typed after Enter in the same terminal read are dropped, and later reads reach the next question. Ctrl-D on an empty line closes readline's input, which wedges the question until the process is interrupted. Go uses huh and bubbletea defaults for all of these: Tab submits the question like Enter, `y`/`n`, arrows, `h`/`l` and Space answer a yes/no question, `x` and Space toggle a checkout, and Ctrl-D never wedges a question. As in TS, bracketed paste is off and keys after an accepted Enter are dropped, so a pasted line ending in a newline submits the text before it and a multi-line paste answers with its first line. Several letters arriving in one terminal read reach huh as one key, so a pasted `y` plus more letters doesn't answer a yes/no question.

Possible improvement: none for Go. The wedge on Ctrl-D is a TS bug: a prompt should either ignore it or cancel.

Why: the questions asked, their order and choices, the answers they accept, and the outcome of each answer match. Cancel matches too: Ctrl-C and Esc cancel with the same exit code. Only the keystrokes that reach an answer differ, and the parity suite sends each answer once its prompt is shown.

Bug-in-TS: yes, for Ctrl-D

## prompts: answers typed before a prompt appears

Scenario: a user types the next answer while envden is still working, before the next question is drawn.

TS behaviour: readline pauses stdin between questions, so input typed meanwhile waits in the terminal and reaches the next question, except keys that arrived in the same read as the previous Enter. Go reads the terminal only while a question is on screen, so typed-ahead input also waits, and it drops keys that arrive after the Enter that ends a question, as TS does within one read. A key that arrives in a later read while the question is still closing can be dropped too.

Possible improvement: none.

Why: typed-ahead keystrokes are interaction timing, not an outcome.

Bug-in-TS: no
