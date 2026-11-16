## process: platform error text

Scenario: A trusted executable passes validation but fails to start, or a filesystem permission operation fails.
TS behaviour: Bun/Node exposes its platform error message.
Possible improvement: Normalize operating-system error messages across runtimes.
Why: Go returns its native OS error text; exact Bun/Node wording is not reproduced. Typed Envden errors retain the reference text and codes.
Bug-in-TS: no

## date-fns: fractional mean-year truncation

Scenario: `milliseconds({ years: 1 })` or `milliseconds({ months: 3 })`.
TS behaviour: returns 31556951999 or 7889237999 milliseconds, preserving floating-point truncation. The Go port matches.
Possible improvement: round these durations to the nearest millisecond.
Why: multiplication of the mean-year constant lands just below an integer.
Bug-in-TS: yes

## server switch: destination unlock required after move

Scenario: `parity/server-move` creates two devices, moves the server with device A, stops the source, then switches device B to the destination.

TS behaviour: device B's `server switch <destination>` exits 1 with `Unlock expired. Run envden unlock`. The destination has no unlocked session for B, and switch reads history before changing B's configured address.

Possible improvement: authenticate to the destination during switch before reading its history.

Why: unlocking against B's configured source cannot unlock B on the destination, especially after the source is stopped.

Bug-in-TS: yes

## protocol: HPKE vector test method

Scenario: Reproducing stored HPKE wraps with a fixed ephemeral seed.
TS behaviour: sealWrap accepts an injected RNG for deterministic ciphertexts; production uses fresh randomness.
Possible improvement: retain this as a test-method difference. Go opens both stored HPKE vectors and checks their ephemeral public keys; SealWrap uses crypto/hpke randomness and has no RNG parameter.
Why: Go 1.26 crypto/hpke does not expose ephemeral-key injection. Production wire behaviour matches.
Bug-in-TS: no

## protocol: OPAQUE setup dummy key

Scenario: Restoring a setup or serving a login without a registration record.
TS behaviour: opaque-ke 4 serializes OPRF seed (64), server private key (32), and dummy public key (32). The dummy record uses that public key, a fresh masking key, and a zero envelope.
Possible improvement: correct the port briefing's final-field name from fakeSk to dummy public key.
Why: Go follows opaque-ke 4 source, including missing-record responses; deriving another public key from the final bytes would break parity. Source: https://github.com/facebook/opaque-ke/blob/v4.0.0/src/opaque.rs and src/messages.rs.
Bug-in-TS: no

## protocol: library diagnostic text

Scenario: Syntactically valid OPAQUE messages fail library deserialization or authentication, or HTTP JSON fails a schema.
TS behaviour: exposes serenity-kit/opaque-ke or Zod diagnostic text. Wrong-password client login returns undefined.
Possible improvement: standardize library diagnostics at the protocol boundary.
Why: Go preserves every explicit requireValue and EnvdenError message, but underlying bytemare errors use its own text and schema decoding reports INVALID_DATA with Invalid protocol data. Wrong-password client login returns OK=false with no error. These library diagnostic strings are not byte-for-byte equivalents.
Bug-in-TS: no

## testing storage: memory refunds retain rate strikes

Scenario: Charge a memory bucket five times, refund a charge, then charge five times after the receipt window expires.
TS behaviour: The memory fake resets the lock deadline but retains strikes, so the next lock lasts 30 minutes. SQLite resets both and locks for 15 minutes. The Go implementations preserve this difference.
Possible improvement: Reset memory strikes on refund to match persistent storage.
Why: Tests using memory can predict a different lockout duration from production.
Bug-in-TS: yes

## CLI filesystem: operating-system error wording

Scenario: A filesystem operation fails outside an EnvdenError boundary.
TS behaviour: Node/Bun exposes its errno wording and syscall/path format.
Possible improvement: Define portable fixed messages for these failures in both implementations.
Why: Go returns its native OS error wording; normal operation and coded errors retain exact bytes, but raw errno messages can differ.
Bug-in-TS: no

## server: native error diagnostics

Scenario: an unexpected server error is logged, or a filesystem operation fails.

TS behaviour: diagnostics use Bun stack frames and Node filesystem error text.

Possible improvement: define shared structured diagnostics and filesystem error messages for both implementations.

Why: the Go server preserves protocol error bodies and fixed EnvdenError messages, but its sanitized internal log and native filesystem errors do not reproduce Bun stack frames or Node errno formatting byte for byte.

Bug-in-TS: no

## history: large version numbers round to JavaScript precision

Scenario: `history --restore 9999999999999999 .env`.
TS behaviour: The parser accepts sixteen digits and converts them with Number, producing version 10000000000000000. Go preserves that rounding.
Possible improvement: Reject versions above Number.MAX_SAFE_INTEGER in both implementations.
Why: A requested version can otherwise select a different number.
Bug-in-TS: yes

## server storage: WAL files after shutdown depend on the platform

Scenario: `envden serve` stops on SIGTERM.

TS behaviour: Bun links Apple's SQLite on macOS, which keeps an empty `envden.sqlite-wal` and the `-shm` file after the database closes (persistent WAL). On Linux Bun bundles its own SQLite, which removes them. So the data folder differs by platform.

Possible improvement: checkpoint and remove WAL files on shutdown everywhere, so a stopped server leaves one file.

Why: a backup taken right after shutdown on macOS needs all three files. Go matches the platform split on darwin only: `SQLITE_FCNTL_PERSIST_WAL`, plus a truncating checkpoint on close, since Apple empties the kept WAL.

Bug-in-TS: no

## status: approval sometimes reported missing right after a takeover

Scenario: `parity/symlink-takeover`, step 4 (`status --json` on device a, run by the TS binary on both sides of a mixed run) on a heavily loaded machine.

TS behaviour: once in five runs, the file showed `held-back` with "checkout needs approval; run envden track" instead of `changed`, although `track` had just approved the checkout. Reruns passed every time, so it depends on timing, not on the server implementation.

Possible improvement: find the timing input (likely the checkout identity or a cached notice refreshed by a detached process) and make status deterministic.

Why: status must not flip on load, and the parity suite needs every scenario to be deterministic.

Bug-in-TS: likely; not yet reproduced on demand

## protocol: "strict" Ed25519 verification is cofactored

Scenario: a signature whose R has a small-order component, for example the order-two point, with a canonical encoding and S < L.

TS behaviour: noble's `verify` with `zip215: false` accepts it, because noble always checks the cofactored equation; the flag only rejects noncanonical encodings. PROTOCOL.md § 1 calls this "strict verification", which reads as cofactorless.

Possible improvement: state the equation in PROTOCOL.md, and decide whether v1 should reject small-order R.

Why: implementations that read "strict" as cofactorless split on which chains are valid. Go now matches noble (`ed25519consensus` plus the canonical-encoding checks), with the reviewer's vector as a test.

Bug-in-TS: no (spec wording)

## protocol: Unicode normalization table versions

Scenario: a string uses Unicode 16 or 17 normalization mappings absent from x/text's Unicode 15 tables.
TS behaviour: Bun ICU 78.1 normalizes U+105D2 U+0307 to U+105C9, rejecting the decomposed string in the str codec. NFKC maps U+1CCF0 to ASCII 0 and U+1CCD6 to ASCII A, so password pw𜳰𜳖 becomes pw0A.
Possible improvement: use the same maintained Unicode table version in both runtimes.
Why: x/text v0.44.0 selects Unicode 15 tables on Go 1.26. Rejecting new characters would also break TS parity. Go retains the maintained normalization implementation until matching tables are available. An exhaustive scalar scan found 57 differing decomposition mappings: U+A7F1, U+105C9, U+105E4, U+11383, U+11385, U+1138E, U+11391, U+113C5, U+113C7..U+113C8, U+16121..U+16128, U+16D68..U+16D6A, and U+1CCD6..U+1CCF9. Their decomposed sequences also affect NFC checks.
Bug-in-TS: no

## cli: empty ENVDEN_HOME selects the working directory

Scenario: ENVDEN_HOME is present with an empty value.
TS behaviour: nullish fallback preserves the empty string and resolves it to the working directory. Go matches this.
Possible improvement: reject an empty override or use the default home.
Why: an empty environment variable unexpectedly puts state in the working directory.
Bug-in-TS: yes

## aliases: inherited Object.prototype names

Scenario: an alias target is constructor, __proto__, or another inherited Object.prototype property; or the source is __proto__.
TS behaviour: an inherited target produces Alias chains are not allowed; assigning a string to __proto__ does not save an alias. Go matches this for the standard Object.prototype properties.
Possible improvement: use own-property checks and a prototype-free alias map.
Why: valid repo IDs should not depend on JavaScript object inheritance.
Bug-in-TS: yes

## server: HTTP transport framing

Scenario: compare raw HTTP/1 framing, including malformed requests rejected before routing.
TS behaviour: Bun emits headers in insertion order and uses its own connection-close and missing-Host diagnostics. Go now sends 100 Continue before routing, including before body-size rejection, matching Bun.
Possible improvement: specify semantic HTTP parity separately from runtime-owned framing.
Why: net/http controls header ordering, early malformed-request responses and connection reuse. For absolute-form requests it overwrites r.Host with the request-target authority and deletes the original Host header before invoking the handler, so the raw Host-header binding also remains different from Bun. HTTP/1.1 without Host is rejected before routing; HTTP/1.0 without Host now matches Bun's 404. Live comparison with the current Bun server confirms Content-Length: 0 on HEAD in both implementations; that review claim was not reproduced. Go sends dashboard asset lengths explicitly. Replacing the maintained HTTP stack to copy these bytes would add a custom HTTP parser. Route status, content type and body parity remain required.
Bug-in-TS: no

## text: Unicode case table versions

Scenario: case mapping uses Unicode 16 or 17 additions.
TS behaviour: Bun ICU 78.1 applies Unicode 17 casing. An exhaustive single-scalar comparison against x/text v0.44.0 found 110 differing scalars: U+019B, U+0264, U+1C89..U+1C8A, U+A7CB..U+A7CF, U+A7D2..U+A7D5, U+A7DA..U+A7DC, U+10D50..U+10D65, U+10D70..U+10D85, U+16EA0..U+16EB8, U+16EBB..U+16ED3.
Possible improvement: align the maintained Unicode table versions across runtimes.
Why: Go retains x/text's full and context-sensitive mappings, including dotted I and final sigma, but its Unicode 15 tables do not include these newer pairs.
Bug-in-TS: no
