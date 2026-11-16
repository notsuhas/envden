# envden Go port review: opus

Base: HEAD `2e1c87c` (port/go). While the review ran, another session committed `de7b874` (ed25519 fix, see #2) and left uncommitted edits in the worktree (server/app.go, adapters/repo/git, core/textcase, lib/commander, and others). Line numbers below are from `2e1c87c`. Go binary built from `2e1c87c` at `/tmp/opus/envden`; TS reference `apps/cli/dist/envden`.

Coverage: every Go package was read side by side with its TS counterpart (protocol, chain, server, client, dashboard, process, pairing, identity, recovery, sync, merge, placement, links, storage, adapters). Experiments run:
- parity harness: 17/18 pass; the one failure was a normalizer flake that passed on rerun
- about 200 differential CLI and HTTP runs
- 21,000 random 3-way merge cases and 1,536 env-file glob cases against TS (0 mismatches)
- 38 placement cases (0 mismatches)
- 4,023 Ed25519/X25519 key-validation cases (0 mismatches)
- `go test -race ./...`: no data races in 117 packages. `cli/sync/enginetest` hit the 10 min default timeout under `-race`, so it's slow, not broken.

Scratch evidence is under `/tmp/opus/` (`part-*.md` hold the long-form notes for each area).

---

## 1. Go client rejects every IPv6-literal server address
- **Severity:** high · **Category:** correctness/parity
- **Go:** go/cli/client/hello.go:87 (`VerifyHello(..., u.Hostname(), ...)`)
- **TS:** apps/cli/src/client/hello.ts:45 (`url.hostname`)
- **What's wrong:**
  - WHATWG `hostname` keeps the brackets (`[fd7a:115c:a1e0::1]`), and Go's `URL.Hostname()` strips them.
  - Both servers sign the bracketed form: TS through `new URL(c.req.url).hostname`, Go through go/server/app.go:150-160, which re-adds the brackets on purpose.
  - So the Go CLI fails the hello binding against any server addressed by an IPv6 literal, whether the server is TS or Go.
- **Repro (ran):**
  - `/tmp/opus/ipv6/ipv6_test.go` builds a valid hello for `[fd7a:115c:a1e0::1]` and calls `client.Hello(ctx, "http://[fd7a:115c:a1e0::1]:8443", pin, ...)`. The result is `Server identity doesn't match the expected server. Check the server address`.
  - `bun -e 'new URL("http://[fd7a:115c:a1e0::1]:8443").hostname'` gives `[fd7a:115c:a1e0::1]`.
- **Fix:** reuse the server's `requestHost` bracket logic on the client side, and add an IPv6 row to hello_test.go.

## 2. Ed25519 verification: Go uses the cofactorless check, TS (noble) the cofactored one
- **Severity:** medium · **Category:** security/consensus parity
- **Status:** `de7b874 fix(go): verify ed25519 with the cofactored equation, as noble does` landed during the review. I haven't verified it.
- **Go:** go/core/protocol/crypto/sign.go:26-37 (`ed25519.Verify`)
- **TS:** packages/core/src/protocol/crypto/sign.ts:20-24, through @noble/curves 2.4.0 `abstract/edwards.js:651-659`. With `zip215:false`, noble still checks `[8](SB − R − kA) = 0`.
- **What's wrong:**
  - TS accepts any signature whose R has a torsion component, and any signature under a mixed-order key (both implementations accept mixed-order keys). Go rejects these.
  - A member with a signing key can publish chain entries or manifests that TS devices and a TS server accept but Go devices reject. Go devices then see an invalid chain and stop syncing.
- **Repro (ran):** `/tmp/opus/edexp/craft.ts` builds R' = rB + T, where T has order 8.
  - TS `Verify` returns `{ok:true}`.
  - Go `crypto.Verify` (`/tmp/opus/gox`) returns `Invalid signature`.
- **Fix:** do the cofactored check with filippo.io/edwards25519, using strict R/A decoding, S < L, and small-order-A rejection. Add torsioned-R and mixed-order-A vectors to the shared known-answer tests. Check that de7b874 does exactly this.

## 3. Go server never times out slow or idle connections
- **Severity:** medium · **Category:** security (DoS)/parity
- **Go:** go/server/main.go:111-116 (`http.Server{ReadHeaderTimeout: -1}`, with no ReadTimeout or IdleTimeout)
- **TS:** apps/server/src/main.ts:55-67 (Bun's default idleTimeout of 10 s)
- **What's wrong:** a peer that sends partial headers, or leaves a keep-alive connection idle, holds a goroutine and a file descriptor forever. The body deadline only starts once headers have arrived.
- **Repro (ran, twice, by two reviewers):** sent `GET /v1/status HTTP/1.1\r\nHost: x\r\n` without the final CRLF. TS closed the connection at about 12 s; Go was still open at 25 s.
- **Fix:** set `ReadHeaderTimeout` and `IdleTimeout` to 10 s.

## 4. Go never reclaims a stale state lock that TS left behind
- **Severity:** medium · **Category:** correctness/concurrency (TS-to-Go upgrade path)
- **Go:** go/cli/state/lock/owner.go:16,39-54 (`CreatedAt int64`)
- **TS:** apps/cli/src/state/lock/lock.ts:17-18 (`performance.timeOrigin + performance.now()`, which is fractional), owner.ts:14 (`z.number()`)
- **What's wrong:** TS writes a fractional `createdAt`, such as `1794792136609.9294`.
  - Go fails to unmarshal it, and `ReadOwner` returns nil.
  - The "no owner" branch only expires the lock when owner.json is missing, so neither the dead-PID rule nor the 24 h rule ever runs.
  - A TS process that crashed while holding the lock blocks the Go binary forever.
- **Repro (ran, twice):** wrote a two-day-old owner.json with pid 99999 and `createdAt: …569.25`, then ran `envden config telemetry off`.
  - TS exits 0.
  - Go exits 3 with `State is locked; retry after the other command finishes`.
  - With an integer `createdAt`, both exit 0.
- **Fix:** decode `createdAt` as float64 (and accept integral floats for `pid`).

## 5. `join` and pairing write or clear state without the state lock
- **Severity:** medium · **Category:** concurrency/parity
- **Go:**
  - go/cli/onboarding/join.go:36 (`RefuseCommittedJoin`, which calls ClearJoiner)
  - go/cli/onboarding/pairing.go:62 (`ClearJoiner`) and :106 (`AtomicWrite pair-pin`)
  - go/cli/pairing/joiner.go:36-52 (`ExchangeJoiner` failure cleanup, both branches)
- **TS:**
  - apps/cli/src/onboarding/join.ts:24
  - apps/cli/src/onboarding/join/pairing.ts:43,49-55
  - apps/cli/src/pairing/joiner.ts:146-156
  - All of these run under `withStateLock`.
- **What's wrong:**
  - Go deletes the `pair-receive` keychain key and the `pair-*` files, and writes `pair-pin`, while another envden process holds write.lock. That process could be running `join --resume` and holding the exchange key.
  - Where TS would report BUSY, Go goes ahead.
- **Repro (ran):** held write.lock with a live owner, then ran `join http://127.0.0.1:64145` on a configured device.
  - TS exits 3 with `State is locked…` and leaves the tree unchanged.
  - Go exits 2 after creating `rejoin/state/`, a new key file and `state/pair-pin`.
- **Fix:** wrap each of these calls in `lock.WithStateLock`, as TS does.

## 6. Setup/join checkout scan silently skips a local env file that differs, instead of asking
- **Severity:** low-medium · **Category:** parity (interactive)
- **Go:** go/cli/program/access/scan.go:136 (`LinkCheckout` without `Choose`, which defaults to "skip"); :123 passes `a.UserHome` instead of the real home
- **TS:** apps/cli/src/onboarding/scan.ts:64 (default `chooseVersion` prompt "differs from the synced copy": Keep separate / Use synced); checkouts/choose.ts:40 (`realHome`)
- **Scenario:** `envden join` on a TTY with an existing `.env` that differs from the vault copy. TS asks; Go prints "differs from the synced copy; skipped" and never links the file. With a symlinked HOME, the labels also show `/private/...` instead of `~/...`.
- **Fix:** pass the same Choose closure that files/scanner.go builds, and `RealHome(a.UserHome)`.

## 7. Placement messages print raw paths without terminal sanitizing
- **Severity:** low-medium · **Category:** security (terminal escape injection)/parity
- **Go:** go/cli/links/file.go:81 (`"removed " + destination + ", a link to a deleted copy"`), :135 (`"%s differs from the synced copy; skipped"`)
- **TS:** apps/cli/src/links/file.ts:57-58,73 (`sanitizeTerminal(homePath(...))`)
- **What's wrong:** control or escape characters in a checkout directory name reach the terminal unfiltered. Paths also print as absolute where TS prints `~/…`.
- **Fix:** apply `homePath` and `SanitizeTerminal`, as TS does.

## 8. `diff` drops the "Skipped checkout requiring approval" line
- **Severity:** low-medium · **Category:** parity (stdout)
- **Go:** go/cli/program/dailyuse/diff_action.go:19 (nil report callback)
- **TS:** apps/cli/src/commands/sync/diff.ts:13 (`syncOptions(options)`, which reports to stdout unless `--json`)
- **Repro (ran):** `diff` and `diff --all` in an unapproved checkout. TS prints `Skipped checkout requiring approval; run envden track`; Go prints nothing.
- **Fix:** pass the same reporter that push and pull use.

## 9. Server address normalisation differs from WHATWG URL
- **Severity:** low-medium · **Category:** parity/correctness
- **Go:** go/cli/onboarding/decisions.go:52-72 (`RequireServerAddress`). The same `url.Parse` gap appears in onboarding/host/rehost.go:28.
- **TS:** apps/cli/src/onboarding/decisions.ts:37-45 (`url.origin`)
- **Repro (ran, verbatim TS function vs Go):**

  | Input | TS | Go |
  |---|---|---|
  | `https://host:99999` | rejects | saves `https://host:99999` |
  | `https://host:0443` | `https://host` | `https://host:0443` |
  | `https://127.1` | `https://127.0.0.1` | `https://127.1` |
  | `https://Bücher.ts.net` | `https://xn--bcher-kva.ts.net` | `https://bücher.ts.net` |
  | `https://host\x` | `https://host` | rejects |
  | `https://%68ost` | `https://host` | rejects |

  Repro files: `/tmp/opus/ipv6/addr_test.go` and `/tmp/opus/addr.ts`.
- **Fix:** at minimum, validate the port range and strip leading zeros. Ideally, add IDNA (`x/net/idna`), IPv4 shorthand, and backslash and percent-decoding for special schemes.

## 10. Unicode 15.0 tables in Go vs 17.0 in Bun (NFC/NFKC)
- **Severity:** low · **Category:** parity/correctness
- **Go:** go/core/protocol/encoding/strings.go:11-17,36-41 (x/text builds `tables15.0.0` before go1.27)
- **TS:** packages/core/src/protocol/encoding/strings.ts:5-6,25-28 (Bun ICU 78.1, Unicode 17)
- **Repro (ran):**
  - `"\u{105D2}\u{0307}"`: TS `str.write` rejects it with "Invalid string"; Go `Str.Write` and `IsDeviceName` accept it. So Go can write chain bytes that TS can't decode.
  - `"pw\u{1CCF0}\u{1CCD6}"`: TS NFKC gives `pw0A`; Go leaves it unchanged. So the password doesn't round-trip between implementations.
- **Fix:** reject code points Go's tables don't know in `str` and `normPw` on both sides, or pin both to one Unicode version. Record it in PARITY-NOTES.

## 11. Sync state decoders skip `binary()`'s canonical base64 check
- **Severity:** low · **Category:** strict decoding
- **Go:**
  - go/cli/sync/local/reconciliation/operation/record.go:28
  - go/cli/sync/local/applied.go:36
  - go/cli/sync/remote/attempt/state/state.go:76
  - All three use `base64.RawURLEncoding.DecodeString`, which ignores `\r`/`\n` and accepts non-zero trailing bits.
- **TS:** apps/cli/src/client/encoding.ts `binary()`, which requires the value to re-encode to the same string.
- **Scenario:** a `.entry` file saved with a trailing newline.
  - TS reports `invalid-state` and quarantines it to `.corrupt-…`.
  - Go accepts it, `applied` comparisons silently fail, and Go writes the newline back.
- **Fix:** use `client.Binary`.

## 12. `pending-repairs.json` order is random
- **Severity:** low · **Category:** parity (file bytes, nondeterminism)
- **Go:** go/cli/sync/remote/accept.go:174-180 ranges over `map[string]bool` (`NoFastForward`, core/chain/manifests/accept.go:26)
- **TS:** apps/cli/src/sync/remote/accept.ts:133 (insertion-ordered Set, filled in manifest-walk order)
- **Fix:** return an ordered slice from AcceptManifest.

## 13. "Skipped env file: X" lines are interleaved instead of printed first
- **Severity:** low · **Category:** parity (stdout order)
- **Go:** go/cli/sync/local/reconcile/reconcile.go:91-104
- **TS:** apps/cli/src/sync/local/reconcile.ts:32,74-83 (`selectedEntries()` filters first)
- **Fix:** do the filter-and-report pass first, as TS does.

## 14. `conflicts.json` drops `originalLink`; `.pending` keeps extra fields and a different key order
- **Severity:** low · **Category:** parity (state file bytes)
- **Go:** go/cli/sync/local/reconciliation/file.go:118; operation/progress.go
- **TS:** apps/cli/src/sync/local/reconciliation/file.ts:47 (`{...targets[0], base, entry, targets}`); `markWritten` re-serializes the zod-parsed operation, which reorders keys and strips `localOnly`/`originalLink`.
- **Fix:** mirror the TS object shapes, or accept the difference in PARITY-NOTES.

## 15. `history` device column width differs from `Bun.stringWidth`
- **Severity:** low · **Category:** parity (stdout)
- **Go:** go/cli/history/list/render.go:119-137
- **TS:** apps/cli/src/history/list/render.ts:66
- **Ran:**

  | Text | TS width | Go width |
  |---|---|---|
  | `❤️` | 2 | 1 |
  | `👨‍👩‍👧` | 2 | 6 |
  | ANSI-colored `red` | 3 | 8 |
  | `\a` | 0 | 1 |

- **Fix:** grapheme-aware width with ANSI stripped.

## 16. Malformed or negated env-files globs differ from Bun.Glob
- **Severity:** low · **Category:** parity (config edge)
- **Go:** go/core/adapters/glob.go:14-17
- **TS:** packages/core/src/adapters/env-files.ts:36
- **Ran:**

  | Pattern | Path | TS | Go |
  |---|---|---|---|
  | include `["["]` | `[` | no match | match |
  | exclude `["!.env{"]` | any | excludes everything | excludes nothing |

  All realistic, well-formed patterns matched.
- **Fix:** an unparseable pattern should give `negate`, and an unclosed `[` should be handled as Bun does.

## 17. Unicode lowercasing in collision and skip checks
- **Severity:** low (not run end to end) · **Category:** parity
- **Go:** go/cli/sync/local/validation/collisions.go, go/core/adapters/env_files.go:18-24 (`strings.ToLower`)
- **TS:** `toLowerCase()`, which applies full and context-sensitive mappings (`İ`→`i̇`, word-final `Σ`→`ς`)
- **Note:** the uncommitted `go/core/textcase/` package in the worktree looks like work on this.

## 18. Small CLI output and file differences
- **Severity:** low · **Category:** parity
- **a) Conflicting-option message:** go/lib/commander/parse.go:169 prints `option '--restore'`, where TS prints `option '--restore <version>'` (`history --all --restore 3`).
- **b) `history --restore abc .env` creates directories:** Go validates inside the action (go/cli/program/dailyuse/history_action.go:35), so it creates `ENVDEN_HOME` and `state/`. TS validates in the argParser and creates nothing. Fix: give the option a `Parse` function.
- **c) Port already in use:** `serve` on a busy port prints `listen tcp 127.0.0.1:N: bind: address already in use` instead of `Failed to start server. Is port N in use?` (go/server/main.go:109-111). This is a common user-facing message, so PARITY-NOTES' errno entry doesn't really cover it.
- **d) Empty `ENVDEN_HOME`:** `ENVDEN_HOME=""` means `~/.envden` in Go (go/cli/adapters.go:53-58) but the current directory in TS (`??`, apps/cli/src/adapters.ts:40). This is a TS bug; add it to PARITY-NOTES or match it.
- **e) Stricter `loadState`:** Go types `session.unlockedUntil` as `*int64` (go/cli/state/model/model.go:18), so a value of `1.5` gives "Unreadable local state"; TS accepts it. This needs a hand-edited file.
- **f) Inodes above 2^53:** the checkout identity string differs when the inode is above 2^53 (go/adapters/repo/git/checkout.go:93 is exact, Bun rounds), so switching binaries asks for approval again. Rare.

## 19. Server HTTP edge cases outside signed flows
- **Severity:** low · **Category:** parity
- **a) Backslash in the path:** `GET /v1\head` gives 400 JSON in TS and a plain-text 404 in Go. go/server/url.go:11 replaces `\` after `EscapedPath()` has already turned it into `%5C`, so that code never runs.
- **b) Query and path decoding:**
  - `?from=%ZZ`: Go drops the parameter and returns 200 with the full range; TS returns 400.
  - `?mailbox=1e1`, `?mailbox= 7`, `?mailbox=0x7`: Go reads 0; TS reads 10, 7 and 7 (go/server/data.go:60-64).
  - Percent-encoded path segments: TS decodes them, Go rejects them (reads.go:36, import_routes.go:62).
  - The authorization outcome is the same in every case.
- **c) Absolute-form request target:** Go signs hello for the URL host; TS signs for the Host header (app.go:150).
- **d) Missing Host header:** HTTP/1.0 without Host gives a 404 in TS and a 200 hello in Go. HTTP/1.1 without Host gets a different 400 body in each.
- **e) `GET /v1/move/sk-pub` Content-Type:** with no type set (move_routes.go:73), net/http sniffs it, so about 3% of keys go out as `text/plain` where Bun always sends `application/octet-stream`.
- **f) Framing:**
  - Go sorts headers.
  - Go sends no `100 Continue`.
  - Go adds `Connection: close` when it skips a large body.
  - The dashboard `/` is sent chunked instead of with a `Content-Length`.
  - Go adds `Content-Length: 0` on HEAD.
  - Status codes, header values and bodies match.

## 20. Case-insensitive `encoding/json` struct decoding where TS checks exact keys
- **Severity:** low · **Category:** parity/strict decoding
- **Go:** go/cli/client/errors.go:45-48 (`struct{ Kind string }`), go/cli/vault/recovery/input.go:38 (`ParseKit`), go/server/identity/keys.go:30-41
- **TS:** apps/cli/src/client/errors.ts:44; apps/cli/src/vault/recovery/input.ts:4-7; apps/server/src/identity/keys.ts:23-40
- **What's wrong:**
  - A server body `{"KIND":"head-moved"}` means HEAD_MOVED (retry) in Go and INVALID_DATA in TS.
  - A kit `{"VAULTID":…}` loads in Go and fails in TS.
  - An identity.json with uppercase keys loads in Go and fails in TS.
  - An empty `secretKey` gives INVALID_DATA in Go and INVALID_INPUT in TS.
- **Fix:** decode with exact keys (jsonvalue or a map).

## 21. `strings.TrimSpace` is not JS `trim()`
- **Severity:** low · **Category:** parity
- **Go:** 23 call sites, including go/core/protocol/pairing/code.go:30, go/cli/vault/recovery/input.go:17,26,41-42 and go/cli/onboarding/decisions.go:53
- **TS:** `.trim()` at the matching sites
- **What's wrong:** JS trims U+FEFF and not U+0085; Go does the opposite. A pairing code, secret key or vault ID pasted with a leading BOM works in TS and fails in Go.
- **Fix:** one shared helper for the ECMAScript whitespace set.

## 22. Dashboard: HEAD on API routes, and `;` in the query
- **Severity:** low · **Category:** parity
- **Go:** go/cli/ui/routes/api.go:20,47-53
- **TS:** Hono dispatches HEAD to the GET handler (hono-base.js:262); `c.req.query()` keeps `;`.
- **What's wrong:**
  - `HEAD /api/status` with a valid token and Origin: TS returns 200 with headers only; Go returns 404.
  - Go's `url.Query()` drops pairs that contain a raw `;`. Browsers encode `;`, so the shipped page is unaffected.
- **Fix:** route HEAD like GET; split the query without dropping `;`.

## 23. Agent skill check fails on a CRLF SKILL.md
- **Severity:** low · **Category:** parity
- **Go:** go/cli/agent/install.go:35 (`(?m)^name: envden$`)
- **TS:** apps/cli/src/agent/install.ts:43 (JS `$` in `m` mode also matches before `\r`)
- **What's wrong:** for a CRLF file, TS treats the skill as its own, while Go returns CONFLICT `~/.agents/skills/envden already holds a different skill`.
- **Fix:** match `\r?$`.

## 24. Latent: zero-length SQLite BLOBs read back as nil
- **Severity:** low (no current input reaches it) · **Category:** storage parity
- **Go:** go/adapters/storage/sqlite/context.go:35 (modernc returns nil for an empty BLOB, which Go treats as absent)
- **TS:** bun:sqlite returns `Uint8Array(0)`, which counts as present.
- **Today:** `States()` returns `Key: nil` for the empty move-session key, where TS returns an empty array. Any future empty value would diverge silently.

## 25. Alias names that are Object.prototype keys (TS bug)
- **Severity:** low · **Category:** parity (TS bug)
- **Go:** go/cli/links/alias.go:13
- **TS:** apps/cli/src/links/alias.ts:26
- **What's wrong:** `envden alias foo constructor` fails in TS with "Alias chains are not allowed", and `alias __proto__ x` is silently not saved. Go accepts both.
- **Fix:** record it in PARITY-NOTES.

## 26. Performance: OPAQUE login runs Argon2id twice
- **Severity:** low · **Category:** efficiency
- **Go:** go/core/protocol/opaque/client.go:96-102 calls masking.go:13-29 after `GenerateKE3`, to fill `ServerStaticPublicKey`, which no caller reads.
- **TS:** packages/core/src/protocol/opaque/client.ts:46-66 (one library call)
- **What's wrong:** every unlock, kit login and pairing login costs about twice the CPU and peak memory of TS.
- **Fix:** drop the field or compute it only when needed.

---

## Checked and equivalent (no finding)
- **Dashboard:**
  - Host allow-list, constant-time bearer-token check, Origin check on non-GET requests, security headers.
  - Error-to-status table, input schemas (UTF-16 lengths, strict keys, safe-integer version), loopback-only listener, token format.
  - The state lock is reentrant through the context and stays correct across goroutines.
- **Client signing:** request fields, empty-body hash, nonce, destination origin check, 15 s timeout, 426 path, one LOCKED→unlock retry, BUSY retries, redirect refusal, error-message table.
- **Server authorization:** every route and swap op checks the same things in the same order with the same codes: verification middleware, gates, proofs, rate-limit charge and refund, nonce, body budget, all 9 operation requirements, mailboxes, move, repair, import, restricted reads.
- **Chain validation:** genesis, linking, signers, epoch wraps, ids, renames, operation and payload rules, descent, forks.
- **Protocol:**
  - Codecs, labels, HKDF, XChaCha box, HPKE suite, Argon2 and OPAQUE parameters, the ±300 s request window.
  - Key validation (4,023-case diff), JSON schemas (23-case diff), pairing codes and secret-key text (25-case diff).
- **Trusted process exec:** directories, manager roots, environment allow-list, working-tree exclusion, owner and mode checks, X_OK, BOM handling.
- **Unlock and login, identity keychain, pairing approver and joiner crypto, recovery-kit wrap and file mode 0600 with O_EXCL.**
- **Merge** (21k-case fuzz), **env-file rules** (1.5k cases), **placement** (38 cases including symlinks, `..`, `.git`/`GIT~1`, FIFOs, modes), **SQLite schema and SQL**, **shell hooks**, **git exec hardening**.
