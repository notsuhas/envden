# Go port findings

Implemented against current HEAD, f6e139b. No TypeScript changed and no commits or pushes made. Concurrent Clack work was left untouched.

| Finding | Status and verification |
|---|---|
| 1 | Fixed IPv6 hello binding; `TestIPv6Hello`. |
| 2 | Already fixed; the reviewer's generated torsioned-R vector passes `TestReviewTorsionedR`. Crypto verification code unchanged. |
| 3 | Fixed header and idle timeouts; `TestConnectionTimeouts`. Bun closed both at 12 s, Go at 10 s with the matching nominal 10 s timeout. |
| 4 | Fixed fractional lock timestamps and integral-float PIDs; `TestFractionalOwner`. |
| 5 | Fixed lock placement; `TestJoinRequiresStateLock`, `TestExchangeCleanupRequiresStateLock`. |
| 6 | Wired shared checkout chooser and real home labels; `TestCheckoutVersionChoices`. |
| 7 | Fixed sanitized home-relative placement messages; `TestSkippedPlacementSanitizesHomePath`. |
| 8 | Fixed diff reporter; `TestDiffReportsUnapprovedCheckout`. |
| 9 | Fixed WHATWG normalization and rehosting comparison; `TestWHATWGServerAddresses`. Existing repo URL normalization was already fixed. |
| 10 | PARITY-NOTES: 57 Unicode normalization mapping differences, with affected scalars listed. Maintained x/text normalization retained. |
| 11 | Fixed canonical base64 decoding in sync records; `TestEntryCanonicalBase64`. |
| 12 | Fixed manifest-walk repair ordering; `TestRepairOrderMatchesManifestWalk`. |
| 13 | Fixed skipped-file report ordering; `TestSkippedFilesReportedBeforePlacement`. |
| 14 | Fixed conflict originalLink and parsed pending-operation shape/order; `TestSyncConflict`, `TestParsedOperationShape`. |
| 15 | Fixed grapheme/ANSI terminal widths; `TestBunStringWidth`. |
| 16 | Fixed malformed and negated globs; `TestMalformedGlobs`. |
| 17 | Full/context-sensitive case mapping already fixed; `TestJavaScriptCaseMapping`. PARITY-NOTES lists 110 newer Unicode case mappings absent from x/text. |
| 18a | Fixed full conflicting-option flags; `TestHistoryConflictIncludesArgument`. |
| 18b | Fixed early restore-version validation; `TestHistoryRejectsVersionBeforeAction`. |
| 18c | Fixed busy-port message; `TestBusyPortMessage`. |
| 18d | Matched empty ENVDEN_HOME behavior; `TestEmptyEnvdenHomeUsesWorkingDirectory`. PARITY-NOTES flags Bug-in-TS: yes. |
| 18e | Fixed fractional session values; `TestFractionalSession`. |
| 18f | Fixed inode/device Number rounding; `TestCheckoutIdentityRoundsLikeNumber`. |
| 19 | Fixed path/query/parameter decoding, HTTP/1.0 missing-host routing, octet-stream content type, eager 100 Continue and dashboard asset length. Tests include `TestLiteralBackslashPath`, `TestEncodedBackslashStaysEncoded`, `TestMailboxNumber`, `TestMalformedRangeNotDropped`, `TestContinueBeforeRouting`, `TestDashboardAssetLength`, and live `TestBunNetworkParity`. HEAD Content-Length: 0 already matches current Bun. PARITY-NOTES covers remaining net/http header-order, connection-framing, HTTP/1.1 parser, and absolute-form original-Host limitations. |
| 20 | Fixed exact JSON keys and empty-secret validation; `TestErrorKindExactCase`, `TestRecoveryInput`, `TestIdentityExactKeysAndEmptySecret`. |
| 21 | Fixed ECMAScript whitespace; `TestECMAScriptTrim`. |
| 22 | Fixed dashboard HEAD and semicolon queries; `TestHeadAPI`, `TestHistoryQueryKeepsSemicolon`. |
| 23 | Fixed CRLF skill detection; `TestInstallCRLFSkill`. |
| 24 | Fixed empty SQLite BLOB presence; `TestEmptyBlobPresent`. |
| 25 | Matched Object.prototype alias behavior; `TestPrototypeAliasTarget`, `TestPrototypeAliasSourceNotSaved`. PARITY-NOTES flags Bug-in-TS: yes. |
| 26 | Removed the second Argon2 derivation and unused login server-public-key field; `TestOpaqueVectors` checks identical observable cryptographic outputs. |

## API and dependency changes

`AcceptManifest` returns `NoFastForward` as an ordered slice; its consumer was updated. Local `model.Window` timestamps use float64 to preserve TS numbers. The unused `LoginFinish.ServerStaticPublicKey` field and its duplicate derivation were removed. Added github.com/charmbracelet/x/ansi v0.11.7 for terminal width.

## Verification

- gofmt: empty; native, Windows and Linux go vet and golangci-lint: 0 issues.
- `go test -count=1 -timeout 60m ./...`: exit 0; exploration package took 1148.554 s. Later changed tests/packages were checked separately.
- `go build -o dist/envden ./cmd/envden`: passed.
- Full parity: 18/18 passed in 400.8 s. Two preceding runs had random snapshot-normalizer collisions; affected scenarios passed on fresh data.
- CLI e2e: passed against the rebuilt binary.
- Live Bun HTTP comparison: passed.
- `bun run check` and `bun run fallow --fail-on-issues`: both passed on the final checkout, after the concurrent Clack fixture was formatted by its owner.
- Baseline Go overlays confirmed the key regression assertions fail without their fixes; the checkout was never reverted.

Logs: /tmp/envden-final-tests.log, /tmp/envden-confirm-parity.log, /tmp/envden-confirm-e2e.log, /tmp/envden-whole-checks.log, /tmp/envden-http-parity-final.log, /tmp/envden-final-repo-check.log.
