# codex-b review

Read-only review of the assigned Go CLI and device adapters against TypeScript. No repository files changed. Reproduction programs are in `/tmp/codex-b/`.

## 1. High · correctness/security · `--yes=false` confirms destructive commands

Go: `go/lib/commander/parse.go:68-75,134-135`.
Reference: `apps/cli/src/commands/sync/rm.ts:7-15`, using Commander, which rejects a value on this boolean option. The Go caller forwards the parsed true value at `go/cli/program/files/rm_action.go:19`.

The parser splits every option at `=`, matches the flag, and discards the supplied value for boolean options. Consequently `envden rm --yes=false .env` sets `yes=true` and bypasses confirmation. This also affects other boolean consent flags.

Reproduced with both built binaries against the same isolated, unpublished tracked `.env` fixture. TypeScript exited 1 with `error: unknown option '--yes=false'` and kept the file. Go exited 0, printed `Removed unpublished file locally`, and removed the checkout link and store file. Go did preserve its normal backup. Script: `/tmp/codex-b/rm-repro.py`; fixture setup: `/tmp/codex-b/setup.go`.

Fix: reject attached values for boolean options, matching Commander's unknown-option behavior before any action or lifecycle hook runs. Add a destructive-command regression for `--yes=false`.

## 2. Medium · correctness/parity · URL host normalization changes repository identity

Go: `go/adapters/repo/git/remote.go:43-55`.
Reference: `packages/adapters/repo/git/src/repo-id/remote.ts:15-23`.

Go's `net/url` hostname is used directly, while TypeScript's WHATWG `URL` canonicalizes HTTP(S) hosts, including IDNA. A valid remote `https://bücher.example/team/repo.git` becomes `bücher.example/team/repo` in Go but `xn--bcher-kva.example/team/repo` in TypeScript. Unicode and punycode spellings identify the same Git host but produce different Go Repo IDs. That changes checkout approval and the Repo ID input to file IDs, so existing synced files no longer match after switching implementations; reapproving creates a separate file namespace.

Reproduced by calling both implementations directly in `/tmp/codex-b/repro.go` and `/tmp/codex-b/repro.ts`. Both accepted the remote without error and returned the differing strings above.

Fix: reproduce WHATWG HTTP(S) host canonicalization before deriving the Repo ID. Add shared vectors for Unicode versus punycode hosts and other URL host forms accepted by the reference.

## 3. Medium · correctness/parity · Simple Unicode lowercasing changes collision decisions

Go: `go/cli/sync/local/validation/collisions.go:20-21`; also `go/adapters/repo/git/remote.go:83-89`.
Reference: `apps/cli/src/sync/local/validation/collisions.ts:10-14`; `packages/adapters/repo/git/src/repo-id/normalize.ts:18-20`.

`strings.ToLower` performs simple character mappings. JavaScript `toLowerCase()` performs full mappings, including context-dependent final sigma and the expansion of U+0130. These are observably different in sync's collision gate. For a case-insensitive target, `['ΟΣ/.env', 'ος/.env']` flags index 1 in TypeScript but no collision in Go. Conversely `['İ.env', 'i.env']` flags index 1 only in Go, holding back a file the reference accepts. `CollisionEntries` feeds these decisions into reconciliation at `go/cli/sync/local/reconcile/reconcile.go:98`.

The same issue changes normalized GitHub/GitLab repository paths. For example `https://github.com/OWNER/İ.git` yields `github.com/owner/i` in Go and `github.com/owner/i̇` in TypeScript. These direct-call results were reproduced with the two `/tmp/codex-b/repro.*` programs. No claim of an on-disk overwrite is made; the proven failures are changed collision decisions and identities.

Fix: use full default Unicode lowercasing with JavaScript-compatible behavior at both sites. Extend shared vectors with dotted I and final sigma, including directory-prefix collisions.

## 4. Medium · correctness/parity · Self-update always selects the glibc Linux asset

Go: `go/cli/updates/self/self.go:72-79`.
Reference: `apps/cli/src/updates/self/platform.ts:7-20` and `apps/cli/src/updates/self.ts:35`.

The production default calls `ReleasePlatform(runtime.GOOS, arch, "glibc")` unconditionally. On a musl Linux installation, this selects `envden-linux-x64` or `envden-linux-arm64` instead of the `-musl` asset. The TS reference detects whether glibc exists and selects `-musl` when it does not. The Go helper supports this distinction, but the real caller prevents it from being used. The CLI supplies no platform override.

Concrete scenario: run the installed Go CLI's `envden update` on Alpine with a newer release available. It requests the glibc asset and, when that release requires glibc, verification cannot execute it, so the supported installation cannot self-update. This finding is established from the production call path; no Alpine runtime or actual GitHub download was used.

Fix: detect the runtime libc, or embed the build's libc target and use it in the updater. Exercise the default selection path for both Linux targets, rather than testing only `ReleasePlatform` with explicit arguments.

## Validation

- Built `go/cmd/envden` to `/tmp/codex-b/envden`.
- Ran direct Go/TypeScript differential probes for option parsing, collision matching, and Repo IDs.
- Ran both CLI binaries against a temporary tracked-file fixture for finding 1.
- All eight scoped adapter/library packages passed: placement/fs, repo/git, keychain/file, shell/rc, network/tailscale, commander, clack, datefns.
- The broad Go run exited 1: `cli/sync/enginetest` ended with `signal: killed` after 442.006 seconds. No assertion failure or cause of termination was reported. Every other package in the invocation passed or had no tests. The full suite is therefore unverified; the termination is not counted as a fifth code finding.
- Saved differential output: `/tmp/codex-b/typescript-results.txt`, `/tmp/codex-b/go-results.txt`, `/tmp/codex-b/rm-results.jsonl`.
- No real keychain, home configuration, tailnet, browser, or external update endpoint was used.
