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

TS behaviour: Bun links Apple's SQLite on macOS, which keeps `envden.sqlite-wal` and `-shm` after the database closes (persistent WAL). On Linux Bun bundles its own SQLite, which removes them. So the data folder differs by platform.

Possible improvement: checkpoint and remove WAL files on shutdown everywhere, so a stopped server leaves one file.

Why: a backup taken right after shutdown on macOS needs all three files. Go matches the platform split with `SQLITE_FCNTL_PERSIST_WAL` on darwin only.

Bug-in-TS: no
