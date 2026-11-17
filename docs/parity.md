# Binary parity

`parity/` runs another implementation's `envden` binary against the TypeScript reference and fails on any observable difference. It is black-box: it drives binaries through argv, a PTY and HTTP, and never imports application code. The harness uses core protocol and chain libraries to sign fixture requests, name shared bases, and validate retained cryptographic objects before normalization.

```sh
(cd apps/cli && bun run build)
cp apps/cli/dist/envden /tmp/envden-copy
bun parity/run.ts --reference apps/cli/dist/envden --candidate /tmp/envden-copy [--scenario <name>]... [--keep]
bun parity/run.ts --reference apps/cli/dist/envden --candidate <envden> --mix [--third <envden>]
bun parity/transport.ts --reference apps/cli/dist/envden --candidate <envden> [--mode semantic|raw]
bun parity/verify.ts apps/cli/dist/envden
bun test parity/__tests__
```

Every scenario runs once with the reference everywhere, then once per assignment, and each assignment is compared with that reference run. A plain run puts the candidate in every role. `--mix` instead swaps the candidate into one role at a time and into all servers or all devices, so it covers a candidate server with reference devices, a reference server with candidate devices, and vaults holding both. `--third` adds a vault where devices a, b and c run the reference, candidate and third binaries, and a run where the third binary serves a reference and a candidate device. Any mismatch, unexpected exit code or step error exits nonzero. `--keep` prints the temporary roots, which hold test passwords and keys.

`transport.ts` defaults to `--mode semantic`, the correctness gate used by CI. Header names compare case-insensitively and header order does not matter; values, duplicate values and their multiplicity remain significant. Status lines and body bytes still compare, apart from the existing uptime counter mask. Date, Connection and Keep-Alive remain excluded. Stalled requests, malformed-length requests and requests with `Connection: close` compare whether the peer closed.

HEAD Content-Length may be zero or the corresponding GET length measured separately from each runtime. Other lengths remain mismatches. Only the three named malformed Content-Length cases (abc, -1 and conflicting lengths), with status 400 and an empty body, permit absent versus zero Content-Length. Duplicate lengths, nonzero lengths, changed security headers, bodies, statuses and close behavior remain failures. `--mode raw` retains the ordered, case-sensitive header diagnostic and does not apply these length exceptions. Neither mode suppresses a failed case.

The maintenance scenario validates the status JSON schema and compares every field, with the nonnegative integer uptime replaced by a duration marker. Elapsed runtime can cross a digit boundary between runs, so raw response length is not a stable status observation.

`verify.ts` wraps the reference six times, each wrapper changing one channel (stdout, stderr, exit code, file content, file mode, a database row), and fails unless the harness reports each one.

## Isolation

Each side of each scenario gets its own HOME, ENVDEN_HOME, XDG config, TMPDIR, Git repositories and server directories, and a small fixed environment with update checks, telemetry and reports off. Git ignores global config and uses fixed dates.

The CLI resolves `tailscale` only from fixed trusted directories and ignores PATH, so a PATH stub cannot isolate it. No process the harness starts may run a real tailscale:

- On macOS every envden process runs under `sandbox-exec`, which denies executing every trusted tailscale path that isn't the stand-in, plus `Tailscale.app`. Setuid `/bin/ps`, which the state lock needs, runs outside the sandbox.
- On Linux there is no sandbox. If a real tailscale sits at a trusted path, every scenario that could run it is skipped.
- `parity/ci/install-stand-ins.sh` installs a stand-in tailscale, marked with `envden-parity-stand-in`, at the trusted path. It refuses to run unless `CI=true`. With `PARITY_HOST_SHIMS=1` (Linux only) it also installs logging shims for the service tools, which `host-here` needs.

Every `setup` asks tailscale for HTTPS readiness, so every vault scenario needs the stand-in. Without it they are skipped with a printed reason; on a developer Mac with Tailscale installed that leaves the five scenarios that need no vault. Run the full suite in CI or in a disposable Linux container that runs the install script. A scenario named with `--scenario` that gets skipped fails the run.

## Comparison

Exit codes, the final file tree under the temporary root and every SQLite file compare exactly after normalization. Terminal output compares by facts:

- stdout and stderr become multisets of facts: paths, file names, IDs, device and repo names, numbers, versions, URLs, placeholders, quoted strings, error codes and outcome words (pushed, conflict, held back, removed, ...). Wording, case, punctuation, ANSI, boxes, spinners, padding and wrapping don't count.
- PTY steps also compare the ordered prompts, the choices offered and the answers sent. A prompt is answered only once it is on screen, and a repeated prompt only once it shows again after its answered redraw.
- `--json` output is parsed and compared without depending on object member order; array order, values and correlated IDs are preserved. `--help` compares the sets of commands and options, ignoring parser built-ins (`help`, `-h`, `--help`, `-V`, `--version`).
- PDFs compare the text drawn by `Tj`/`TJ` and the Info fields except dates, ID and library Creator/Producer attribution.

## Normalization

One registry per run covers output, files and SQLite. Crockford base32, hex and base64url forms of the same bytes share one placeholder, numbered per byte length; repeats keep their identity. Roots, homes and binary paths become named placeholders, local URLs, pairing codes, secret keys, UUIDs, kit PDF suffixes and filesystem identities get their own kinds, and clock values and durations become `<TIME>` and `<DURATION>`. Identities are labeled canonically across the complete output, tree and database observations, so encounter order, random file names and row order do not change their meaning. `.env` files and scenario fixtures stay literal.

SQLite files are dumped table by table with column types and every row, duplicates kept. No rows are filtered. Pairing goes through a proxy that holds slot reads until the matching write and approver reads until the swap. This controls pairing polls; background notice cancellation and implementation read schedules can still change nonce counts, which remain comparison failures. Move interruptions go through a proxy that fails one protocol path while armed.

Before random-byte normalization, collection verifies content-addressed blob names, stored-header references, SQLite object hashes, entry-chain signatures and manifest signatures against their authenticated membership state. Cached verified state and checkpoint references must agree with retained authenticated records. Decoded signed fields and reference relationships join the comparison. Protocol decoding enforces wire ordering before normalization; verified wrap and file collections are sorted again after identity renaming, retaining every member and duplicate observation. File-backed device keys must match their public records; available device keys open epoch wraps, and available epoch keys open keyrings and verify commitments. Available epoch and ID keys authenticate file names and retained file bodies. Decrypted names and plaintext digests compare literally, so valid re-encryption cannot hide changed content. Missing retained keys produce explicit authentication-limit observations.

`bun test parity/__tests__/integrity.test.ts` is the deterministic collector tamper gate: it flips bytes in cached and SQLite-backed ciphertext and signed records, rejects invalid AEAD even after hashes and signatures are recomputed, accepts independent randomized valid fixtures, and detects changed authenticated plaintext. This complements the executable channel wrappers in `verify.ts`.

## Scenarios

Origin is the port branch each one came from.

| Scenario | Origin | Covers |
| --- | --- | --- |
| channel-probe | go | literal file and DB fixture, used by `verify.ts` |
| help | both | `--help` and `--version` on every command |
| errors-config | both | unknown command and option, parser errors with ESC bytes, unconfigured use, invalid input, config reads and writes, unsupported env-file pattern, doctor JSON |
| settings | rust | shell install twice and uninstall per shell, agent install, post-install refresh |
| local-state | rust | empty ENVDEN_HOME, `Object.prototype` names as aliases |
| user-flow | both | default interactive setup with a PDF kit, pairing join, e2e edits, conflict by editing markers, reports |
| pairing-sync | both | wrong mailbox, pairing, push and pull bytes, rename twice, removal, removed device refused |
| recovery-sync | both | kit join, diff, history, restore (terminal, refused, scripted, version above 2^53), deletion |
| conflict-edit, conflict-keep-mine, conflict-take-server | go | conflict listing, marker refusal, each resolution |
| shared-vault | new | three devices, one by kit and one by pairing; the `--third` vault |
| unreachable | rust | push, pull and status with the server down |
| files-worktrees | both | worktree auto-approval, pull --all, placement, local-only, alias, rm, untrack |
| symlink-takeover | both | taking over a foreign env link and restoring it on untrack |
| file-options | rust | settings reads, copy placement, env-files, history confirmation, removal of base and corrupt marker |
| resolution-options | rust | resolve by file and repo, non-terminal refusal, detached file, aligned edits |
| directory-collision | rust | two links differing only in directory case (outputs only) |
| onboarding-errors | both | invalid token, unreachable server, unknown mailbox, resume with nothing pending |
| onboarding-options | rust | explicit setup flags, pasted recovery join, notice refresh |
| join-local-file-choice | rust | join keeping a differing local file |
| rejoin-after-removal | rust | rejoin by kit and by pairing after removal |
| pairing-secret | rust | wrong secret with the approver waiting, then a fresh code |
| recovery-pdf | rust | removal with a JSON kit, replacement PDF kit |
| locked-session | rust | unlock period, exhausted retries, push and pull unlocking a locked session |
| host-here | rust | `setup --host-server` twice against the host shims; CI only |
| devices-vault | both | device list, control-character rename, wrong password, Ctrl-D at a prompt, kit replace, password change and reset, rotate, removal |
| maintenance | rust | doctor, agent, history and diff variants, HEAD on server routes, `envden ui` GET/HEAD and Ctrl-C |
| server-move | both | move with a prompted token, nothing to resume or abort, switch after the source stops |
| server-move-interrupted | both | faults before the source commit, at chain transfer and before the destination commit; abort, refused abort, resume, switch |
| server-repair, server-repair-without | both | restored server, reports, finish with or without a device |
| server-repair-lost | rust | restored backup missing the newest version, `--accept-lost` |

Not carried over: Go's separate `setup-interactive` (now part of `user-flow`), `server-move-resume` and `server-move-abort` (now `server-move-interrupted`); Rust's `command-surface`, `invalid-input`, `credentials`, `checkouts`, `pairing` and `sync` (merged into the scenarios above); Rust's PATH stub and `maintenance` PATH shims (the CLI ignores PATH); Rust's `--strict-output`, nonce-row deduplication (replaced by the pairing proxy), recovery-join notice regrouping (not needed against the reference), and the hybrid launcher (`--mix` covers it). Rust's signature vectors and recovery-PDF fixtures stay on `port/rust`, since they feed that port's unit tests.

`parity/scenarios/known.ts` records the corrected outcomes for B1, B3, B10, B12, B15, B19 and B22. The harness requires those outcomes from both binaries.

## Adding a scenario

Add an `IScenario` under `parity/scenarios/<domain>/`, list every role it uses (devices `a`, `b`, `c`; servers `server` or `server:<name>`), set `needs: "stand-in"` if it runs setup, and register it in `catalog.ts`. Give every intentional failure its exit code. Register fixture text with `c.normalizer.literal` before writing it. Run it against two copies of the reference, then the full suite and `verify.ts`.

## Limits

- POSIX only: Bun's PTY doesn't run on Windows, so Windows placement and service paths are untested.
- Final state is compared, not every intermediate write. Retained protocol objects receive the checks above; this is not a claim that all opaque state is authenticated or semantically equivalent. Password envelopes are bound to signed header hashes but are not decrypted. OPAQUE registration/session records, pending pairing mailboxes, setup/session/grant records and other unrecognized binary formats retain structural observations without independent cryptographic verification. Unreferenced cached file blobs have content-address checks but no plaintext comparison. Unavailable keys limit AEAD verification; incomplete retained entry chains fail validation rather than establish equivalence. Protocol vectors remain the byte-parity gate.
- `host-here` needs a disposable Linux runner, and first-time hosting over Tailscale HTTPS is not covered. Update installs, GitHub downloads and telemetry sends are excluded.
- Repair covers one restored backup and one lost version; longer histories, pruning, expiry and other crash points need more scenarios.
- The Ctrl-D step fails if the prompt has not exited within five seconds.
