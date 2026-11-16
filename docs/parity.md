# Binary parity

`parity/` runs another implementation's `envden` binary against the TypeScript reference and fails on any observable difference. It is black-box: it drives binaries through argv, a PTY and HTTP, and never imports application code. Only `transport.ts` and `file-options` use `@envden/core/protocol`, to sign raw requests and to name a shared base.

```sh
(cd apps/cli && bun run build)
cp apps/cli/dist/envden /tmp/envden-copy
bun parity/run.ts --reference apps/cli/dist/envden --candidate /tmp/envden-copy [--scenario <name>]... [--keep]
bun parity/run.ts --reference apps/cli/dist/envden --candidate <envden> --mix [--third <envden>]
bun parity/transport.ts --reference apps/cli/dist/envden --candidate <envden>
bun parity/verify.ts apps/cli/dist/envden
bun test parity/__tests__
```

Every scenario runs once with the reference everywhere, then once per assignment, and each assignment is compared with that reference run. A plain run puts the candidate in every role. `--mix` instead swaps the candidate into one role at a time and into all servers or all devices, so it covers a candidate server with reference devices, a reference server with candidate devices, and vaults holding both. `--third` adds a vault where devices a, b and c run the reference, candidate and third binaries, and a run where the third binary serves a reference and a candidate device. Any mismatch, unexpected exit code or step error exits nonzero. `--keep` prints the temporary roots, which hold test passwords and keys.

`transport.ts` starts `<bin> serve` for both binaries with one shared identity and setup token. It sends the union of the Go port's 21 raw requests, the Rust port's 18 (including two pipelined ones) and 4 requests whose declared body never arrives, then compares the status line, the ordered headers except Date, Connection and Keep-Alive, the body bytes, and for stalled requests whether the server closed the connection.

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
- `--json` output is parsed and compared exactly, including key order. `--help` compares the sets of commands and options, ignoring parser built-ins (`help`, `-h`, `--help`, `-V`, `--version`).
- PDFs compare the text drawn by `Tj`/`TJ` and the Info fields except dates and ID.

## Normalization

One registry per run covers output, files and SQLite. Crockford base32, hex and base64url forms of the same bytes share one placeholder, numbered per byte length; repeats keep their identity. Roots, homes and binary paths become named placeholders, local URLs, pairing codes, secret keys, UUIDs, kit PDF suffixes and filesystem identities get their own kinds, and clock values and durations become `<TIME>` and `<DURATION>`. Identities first seen in the snapshot are labeled canonically from the whole tree and database, so random file names and row order don't matter. `.env` files and scenario fixtures stay literal.

SQLite files are dumped table by table with column types and every row, duplicates kept. No rows are filtered: pairing goes through a proxy that holds slot reads until the matching write and approver reads until the swap, so the number of polls, and of nonce rows, is fixed. Move interruptions go through a proxy that fails one protocol path while armed.

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

`parity/scenarios/known.ts` records the reference behaviour for decided but unfixed bugs (B1, B3, B10, B12, B15, B19, B22). Both sides currently show the buggy behaviour; flip the entry when the fix lands.

## Adding a scenario

Add an `IScenario` under `parity/scenarios/<domain>/`, list every role it uses (devices `a`, `b`, `c`; servers `server` or `server:<name>`), set `needs: "stand-in"` if it runs setup, and register it in `catalog.ts`. Give every intentional failure its exit code. Register fixture text with `c.normalizer.literal` before writing it. Run it against two copies of the reference, then the full suite and `verify.ts`.

## Limits

- POSIX only: Bun's PTY doesn't run on Windows, so Windows placement and service paths are untested.
- Final state is compared, not every intermediate write. Ciphertext is opaque: equal-length corruption shows only if it changes equality or later behaviour. Protocol vectors cover byte parity.
- `host-here` needs a disposable Linux runner, and first-time hosting over Tailscale HTTPS is not covered. Update installs, GitHub downloads and telemetry sends are excluded.
- Repair covers one restored backup and one lost version; longer histories, pruning, expiry and other crash points need more scenarios.
- The Ctrl-D step waits five seconds for an exit before sending Ctrl-C, so a binary that wedges costs five seconds instead of failing outright.
