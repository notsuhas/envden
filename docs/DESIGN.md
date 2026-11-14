# envden design (v1)

Terms are defined in `../CONTEXT.md`. Decisions with history are in `adr/`. Revised after three rounds of adversarial review by Codex (GPT-6.1 Sol) and Claude Fable 5.2.

## Problem

Developers keep env files (gitignored, often with comments) in many repos and worktrees across several machines. Secrets managers (Infisical, Doppler, Phase) store keys, not files, so comments, order and blank lines are lost. dotenv-vault is paid SaaS. Small file-syncing CLIs (DotVeil, enva, envman) are unmaintained or have broken crypto. envden syncs whole env files byte-for-byte, self-hosted, end-to-end encrypted, over the user's private network.

## Threat model

- **Server**: untrusted for confidentiality and integrity. It may read, drop, replay, reorder or forge anything it stores or relays. It can always deny service, and it can choose not to enforce unlock expiry. A server colluding with a removed device or an old recovery key can fork history, and a server alone can show different devices different branches (each device stops as soon as it sees the other branch); both residuals are documented.
- **Network**: the network adapter (Tailscale in v1) is transport only. envden trusts no identity it reports.
- **Devices**: trusted while they're members. A removed device keeps whatever it already pulled; envden can't revoke that and says so.
- **Lost or stolen device**: after its unlock expires, it can't fetch anything new. Files already on disk are protected by OS login and disk encryption, not by envden.
- **Checkouts**: not automatically trusted. A folder claiming a repo's remote doesn't get secrets until the user approves it once.

## Shape

- **Server**: one Docker container, or `envden serve` on one of the user's devices (launchd / systemd / Windows login service). Stores ciphertext and opaque IDs only. One server per vault, no peer-to-peer (ADR 0001). Many vaults per server, one owner each.
- **Device**: the `envden` CLI, a single Bun-compiled binary for macOS, Linux and Windows. No background daemon.
- **Stack**: TypeScript monorepo on Bun (ADR 0002). `apps/cli`, `apps/server` (+ Dockerfile), `apps/web` (Next.js + Fumadocs), `packages/core` (crypto, protocol, merge, adapter interfaces, `SITE_URL`), `packages/adapters/*`.
  - Monorepo: Bun workspaces. Tests: `bun test` plus the adapter contract tests (Vite+'s Vitest runs on Node, and the code uses Bun APIs). Format, lint and type check: Vite+ (`vp check`: Oxfmt, Oxlint, tsgolint). Unused code, cycles, duplication and complexity: Fallow. Wire messages validated with Zod.
  - CLI: `commander` with `@commander-js/extra-typings`, prompts from `@clack/prompts`, keys in `Bun.secrets` behind the keychain adapter, git via the `git` command.
  - Server: Hono on `Bun.serve`. Request signing, rate limits and the setup token are Hono middleware; the CLI uses Hono's typed client; tests call `app.request()` with no open port. SQLite via `bun:sqlite`.
  - Site: Next.js, Fumadocs, Tailwind, Motion for landing-page animations, hosted on Vercel.
  - Releases: GitHub Actions builds every platform binary and the Docker image, uploads the binaries and their `SHA256SUMS` file (PROTOCOL § 15); channels under Distribution.
- **Crypto libraries**: `@noble/ciphers`, `@noble/curves`, `@noble/hashes`; Argon2id from `hash-wasm` (Bun's `node:crypto` Argon2 throws "not supported"); OPAQUE from `@serenity-kit/opaque`; HPKE from `@hpke/core` (+ `dhkem-x25519`, `chacha20poly1305`). All pinned exactly, RFC test vectors in CI. No hand-rolled primitives. The envden protocol that composes them (device list, manifest, wraps, pairing channel) is ours: specified in `PROTOCOL.md` with test vectors, and reviewed separately before release.

## Adapters (ADR 0004)

| Kind | Question | v1 | Later |
|---|---|---|---|
| Network | How devices reach the server | Tailscale | NetBird, ZeroTier, LAN |
| Repo | Which repo is this checkout? | Git | Jujutsu, Mercurial, plain folders |
| Storage | Where the server keeps ciphertext | Local disk (SQLite + files) | S3, R2, MinIO |
| Keychain | Where a device keeps its keys | macOS Keychain, Windows Credential Manager (`persist: local`), Linux Secret Service, 0600 file fallback (forced by `ENVDEN_KEYCHAIN=file`) | 1Password CLI |
| Placement | How files appear in a checkout | Link, copy | — |
| Shell | Out-of-sync line | zsh, bash, fish, PowerShell | nushell |

Interfaces live in `packages/core`; each adapter is its own package and must pass the shared contract tests. Built into the binary in v1; added by fork or PR. A template, a "write an adapter" docs page and an agent skill for writing adapters ship with the repo. Encryption, the sync protocol and merging are not adapters.

## Crypto (ADR 0003)

Exact constructions, encodings and test vectors go in `PROTOCOL.md`, written and reviewed before the crypto code. This section is the contract it must meet.

### Keys and signatures

- **Device keys**: each device has an X25519 key pair (encryption), an Ed25519 key pair for vault objects, and a separate Ed25519 key pair for server requests. Held via the keychain adapter.
- **Signatures are domain-separated**: every signature covers `label ‖ length-prefixed bytes`, with one label per object type (device-list entry, manifest, request, server hello). Requests bind the server pin, method, path, body hash, time and a nonce. Secrets (setup token, secret key) are never sent; requests carry a MAC over the signed request instead.
- **Epoch keys**: the vault key has generations. Each epoch has a random 256-bit key. New writes use the newest epoch; old data is never re-encrypted. Older epoch keys live in a keyring encrypted under the newest; the keyring's hash is in the manifest.
- **Wraps**: an epoch key is wrapped to each member with HPKE base mode (RFC 9180), info = vault ID ‖ epoch ‖ recipient. The wraps live inside the signed device-list entry that creates the epoch (or adds the device), with a key commitment each recipient checks.
- **ID key**: a separate, non-rotating key used only to make opaque IDs, kept in the keyring. Rotating epochs never renames anything on the server.
- **Recovery key pair**: X25519 + Ed25519, stored only inside the password envelope. It is a vault member that can receive epoch keys and can sign only "add device" (which is how a kit join is recognised; there's no flag to fake).
- **Secret key**: random, generated at vault creation, printed in the recovery kit, never stored on any device.

### Vault creation

- The first device generates every key and secret locally, signs the genesis entry and the epoch-1 entry, and stores them before uploading anything. **Vault ID = hash of the genesis entry.** Nothing in a vault's root ever comes from the server.
- The setup token printed by the server embeds the server key's fingerprint. The device pins the server from it and checks a signed challenge before sending the token or anything else.

### Device list and manifest

- **Device list**: a hash-chained log of entries: genesis, add device, remove device, new epoch, replace recovery key, server moved, repair done. Each entry is signed by a key that is a member at the entry's parent.
- **Manifest**: a signed header (operation, previous manifest's hash, device-list head, epoch, keyring hash, hash of the file list) plus the file list (every file ID with its version, epoch, ciphertext hash and encrypted name; deleted files stay as tombstones).
- **One commit point**: a device-list entry takes effect only through a manifest swap naming it, done as one compare-and-swap. A push uploads ciphertext first, then swaps. If two devices race, the loser re-signs on the new head. A crash before the swap leaves nothing visible.
- **Accepting a manifest**: it must descend from the device's checkpoint by hash chain, be signed by a member at its device-list head, and never move the head or the epoch backwards. A branch that doesn't descend is a fork, whatever its counter (including a different manifest at the same number): envden stops and shows both sides. Manifest headers are never pruned, so descent can always be checked.
- **Freshness**: each device keeps the last manifest head it accepted. A paired device inherits the approver's checkpoint. A kit-recovered device starts from the envelope's checkpoint (below).

### Files

- XChaCha20-Poly1305 under a per-file key derived from the epoch key. Associated data binds vault ID, epoch, file ID and version; the signed manifest binds the ciphertext hash. Padded to 256-byte steps; max 1 MiB.
- The Repo ID and path travel encrypted in the file list and inside each file, so a device knows which files are its repos' without downloading the others; it recomputes the file ID to check them.
- **Opaque IDs**: file ID = HMAC(ID key, Repo ID ‖ path), so the same path in different repos doesn't correlate. The server still sees rough sizes, timing, device count and device names (the device list is signed, not encrypted); docs say so.

### Password envelope and recovery

- Envelope key = HKDF(Argon2id(master password, fresh salt per seal, fixed v1 parameters) ‖ secret key), labelled `envelope-key`.
- The envelope contains the recovery key pair, the vault ID and the manifest it builds on; the manifest that installs it names its hash. It's sealed only in the same swap as vault creation, a password change or reset, or a recovery-key replacement, since devices never hold the secret key. The kit prints the vault ID and the server address (a hint; the real server pin comes from the verified device list, so a kit survives a server move).
- **Changing the master password** needs the old password and the recovery kit (to reseal the envelope). **Forgot the password** but have a device and the kit: reset it with the kit (new recovery keys, new epoch, same kit). **Lost the kit** but know the password: replace the recovery key, which prints a new kit.
- **Recovery kit**: the secret key, plus a space to write the master password. A kit with the password written on it opens the vault on its own, so the docs say to store it like a passport.
- **Join with the kit**: the server releases the envelope only after an OPAQUE login with the master password, rate-limited separately from members' logins so strangers can't lock members out. The device decrypts it, verifies the device list from genesis to head, and checks its recovery key is the current recovery member. The recovery key signs "add device" for it. Every other device shows "*laptop* joined with the recovery kit" on its next command.
- **Replacing the recovery key** (lost kit): needs a fresh password login. It starts a new epoch, and the new envelope replaces the old one in the same swap. With both password and kit lost, the user creates a new vault from a device's local store.

### Pairing (join with a pairing code)

- `envden device add` asks for the master password, then shows a code like `3-K7QF-2MXP`. The `3` is a public mailbox number; `K7QF-2MXP` (~40 bits, no lookalike characters) stays secret. Valid for at most 10 minutes, capped by each device even if the server advertises a longer window.
- The new device runs `envden join <server>` and types the code. The two run OPAQUE through the server. The old device does OPAQUE registration with the code entirely locally and plays the OPAQUE server. It marks the code used before answering the first login attempt, answers only that one, and erases its state when it finishes or expires.
- Pairing and unlock use different OPAQUE identifiers, since the library has no context parameter. The pairing identifiers include the server pin and mailbox number.
- After login, one encrypted message each way, under a key per direction derived from the OPAQUE session key:
  - new → old: device name and public keys.
  - old asks "Add *throwbook*? [y/N]". On yes it commits the "add device" entry, which carries the new device's wrap of the current epoch key.
  - old → new: vault ID, server pin and the manifest that committed it, re-sent until it arrives. No keys travel in the channel; the new device verifies everything from the server against these, and never counts itself a member without this message.
- Waiting for the other device does not hold the local state lock. A timeout preserves the join exchange for `envden join --resume`; approval retrieval has its separate 24-hour window.
- The joiner aborts if the received pin doesn't match the server it dialled.
- A bad server can only relay or block, and gets one live guess at the code against each side.
- **Library**: `@serenity-kit/opaque`, pinned (at least 1.1.1 once published; it fixes a WASM memory leak on malformed input; until then, validate message shapes before calling it). It returns the session key on both sides and supports fully local registration (verified in the 1.1.0 type definitions). Audit coverage: NCC reviewed `opaque-ke` v0.5.0 against draft-03 (2021). 7ASecurity's audit of the wrapper ran in 2023, announced 2024, with the version not confirmed. 1.0.0 moved to `opaque-ke` 4.0.0, which its maintainers say matches RFC 9807. Re-check before release.

### Unlock and expiry

- Each vault has an OPAQUE registration of the master password on the server (password only; the server never sees it). Stretching parameters are set explicitly, at least as strong as the envelope's Argon2id.
- A device must log in with the master password at least once per its unlock period: 1d, 7d, 30d (default) or never. The server refuses that device's pulls and pushes after the period until it logs in again. A paired device inherits the approver's remaining window, not a fresh one.
- Sensitive actions need a fresh password login even inside the window: adding or removing a device, rotating, replacing the recovery key, changing the password or unlock period, moving the server, and reading the envelope. Each sync carries exactly one kind of change, and the server checks it has the matching permission.
- **Limits, stated in the docs**: expiry relies on an honest server. A hacked server can keep serving a stolen device, and expiry means nothing if the stolen laptop is the server. Files already on disk are protected by OS login and disk encryption, not envden. A hacked server can guess passwords offline against its OPAQUE record; that alone doesn't open the vault, which also needs the secret key.

### Removing a device

- `envden device rm` asks for the master password, then commits "remove device" and a new epoch in one manifest swap. The new epoch key is wrapped to the remaining devices and the recovery key. Nothing is re-encrypted.
- Offline devices pick up the new epoch on their next pull and rebase pending edits onto it.
- If the removed device ever held the recovery key in memory (created the vault, joined with the kit, replaced the kit, or changed or reset the password; envden works this out from history), envden recommends replacing the recovery key in the same step (one epoch, new kit). Otherwise it trusts that the key was erased.
- The removed device can decrypt any ciphertext from its epochs that it obtains, including history it never pulled, and can test guessed file names with the ID key. envden lists every file and key name up to that epoch so the user can rotate those credentials.

## Server

- Listens on localhost behind `tailscale serve`. Every request is device-signed, so forged headers or local processes gain nothing. Tailscale identity headers aren't used (they're empty for tagged devices). Setup checks that HTTPS certificates are enabled on the tailnet.
- **Creating a vault** needs a one-time setup token printed in the server logs (`docker logs`, or the `envden serve` output). It embeds the server pin (see Vault creation). After that, only device signatures count.
- Devices **pin** the server (a hash of its signing key) at setup or join, and store its address separately.
- History: every manifest and ciphertext version kept for 90 days, and at least the last 20 per file. Deletes are tombstones and outlive history pruning, so an offline device can't bring a deleted file back without an explicit restore. Repair-fix file lists, and the list before each, are kept forever.
- **`envden server move`**: opens a move session on the new server (setup token), freezes the old one (any member can unfreeze it before the switch), copies and verifies everything, re-registers the master password on the new server (the user types it), then commits a "server moved" device-list entry (old pin, new pin, new address) on the old server, which turns read-only, and the same on the new one. Every step can resume after a crash, from any member if the moving device is lost; it can abort until the final commit. The entry is signed by a member device, never by a server. Devices that see it switch, remember it, and never accept the old server again, even if it's restored from a backup. A device accepts the new server only if its manifest descends from the local checkpoint.
- Backups: file contents are ciphertext, but the data folder also holds the master password's OPAQUE record, which someone could guess passwords against offline. Protect backups like a password database. Docs include a tested restore: `envden serve --restored` prints a repair token per vault and accepts nothing but repairs. Each device runs `envden server repair` with the token, re-uploading its newer signed history and its repos' files. `--finish` checks every device's signed report itself and needs every device to have repaired or be dropped (`--without`; it rejoins later as a new device, keeping its local files), then logs in, re-registering the password only if the chain shows a password change or reset after the restored point. Run `--restored` once by hand, not from the service definition: rerunning it mints a new token, which voids reports made with the old one. A file whose newest version no device holds is listed by name; with `--accept-lost` it goes back to the newest verified older version, or is marked lost, and every device reports it.
- Laptop-hosted servers are supported; setup recommends an always-on host, since two laptops only sync while the server laptop is awake. An unreachable server never blocks local work; status shows "server unknown".

## Store, checkouts and placement

User-owned tool directories remain outside envden's control if the user personally symlinks their tools into a checkout.

- Store: `~/.envden/store/<repo-id>/<path-in-repo>/<file>`; checkpoint, history and update cache in `~/.envden/state/` (never rolled back by a store backup); bases in `~/.envden/base/`, conflict files and pre-overwrite backups in `~/.envden/conflicts/` (backups and older bases deleted after 30 days; conflict files deleted on resolution). Folders 0700, files 0600 (ACLs on Windows).
- **Repo ID**: from `git remote get-url origin` (falls back to the only remote, else asks). Host aliases resolved with `ssh -G`, host lowercased, path lowercased for hosts with case-insensitive paths (GitHub, GitLab), full path kept (subgroups, Azure DevOps), `.git` stripped. Ships with test vectors.
- **Approved checkouts**: the first time env files would land in a checkout, envden asks in the terminal. `--yes` doesn't skip it. Every new canonical checkout root or recreated checkout needs explicit approval saved outside the checkout in envden state. Worktrees of an approved repository get a shorter prompt but are never approved automatically. A changed remote never silently remaps an approved checkout.
- **Env files**: `.env` and `.env.<name>`, excluding templates (`.example`, `.sample`, `.template`, `.defaults`) and never `.envrc`. Only files git ignores; skips build output folders (`node_modules`, `.next`, `dist`, `build`, …). `envden config env-files '{"include":[".env",".env.*"],"exclude":["*.example","*.sample","*.template","*.defaults"],"extraSkipped":["generated"]}'` replaces the filename include/exclude patterns and adds skipped directory names. Patterns without `/` match basenames; others match checkout-relative paths. Refuses tracked files and always excludes `.envrc`.
- Before linking, `git check-ignore` must pass, else envden adds the path to the checkout's exclude file (resolved through git, so worktrees work).
- Pulled paths are validated: no `..`, no absolute paths, `lstat` before writing, no following symlinks out of the checkout.
- Placement uses directory handles on macOS/Linux; Windows or unavailable FFI retains a parent-swap race after the final path check.
- Monorepos: `apps/web/.env` maps to `<repo-id>/apps/web/.env`.
- Forks: when an `upstream` remote's Repo ID already has envs, ask once to alias, only if no checkout of the fork already has placed files. `envden alias` also fixes renamed or moved repos.
- **Link mode** (default): a symlink into the store. All links to one store file share one base.
- **Copy mode**: real copies, each with its own base; push detects changes against it, including a revert to any earlier version. Requires explicit consent when symlinks aren't available, and is offered once per checkout, interactively, when its root contains `.devcontainer/`, `docker-compose*.yml` or `Dockerfile`. `envden track --copy` selects it explicitly; `envden config placement <path> link|copy` saves the checkout preference.
- **Local only**: a checkout can mark a file as deliberately different (e.g. `PORT` per worktree). It becomes a copy that is never pushed or pulled, with no nagging.
- **Detached checkouts**: if a link was replaced by a regular file (atomic save, `sed -i`, `cp .env.example .env`), envden relinks if the content matches the store or a version synced within the last 30 days. Otherwise it marks the checkout detached, keeps both versions, and asks on the next interactive command. Never silently. The shell line never does this.
- Docker builds: docs show `.dockerignore` and BuildKit secret mounts. Copy mode is not recommended for builds.

## Sync

- Explicit only. `envden push` / `envden pull` in a checkout act on its repo; `--all` acts on everything in one manifest swap.
- A push names the manifest head it was based on; the server rejects it if the head moved (compare-and-swap). Requests are retry-safe. Local operations on a store file are serialized with a lock.
- Missing or recreated checkouts are skipped with a notice to run `envden track`; a changed remote still requires `envden alias`. Cancelling a reconciliation prompt aborts the command.
- A local file without a base conflicts with a server tombstone. Restoring it requires an explicit choice.
- Pull never overwrites unpushed local edits: those go through merge. A backup is kept before any overwrite.
- Each device keeps the ciphertext of files it uses, so it can repair a restored server for those repos. It never fetches other repos' files; their names come from the file list.
- **Merge**: each entry is the raw bytes of one key's assignment (including its comments), compared as bytes, never as parsed values. The local file is the layout; keys added remotely go at the end in remote order. One-sided changes and identical local and remote files are accepted byte-for-byte before parsing, including unsupported syntax or style changes; key names are reported only when both base and result parse. Final line terminators do not count as key changes. Keys changed on one side merge. A comment block moved to different keys on both sides is a layout conflict. Anything ambiguous becomes a whole-file conflict: a key changed on both sides, delete vs edit, duplicate keys, unterminated quotes, multi-line values, `export` or quote-style changes, a comment toggled against an edit. Clean merges are shown (key names only) and confirmed. Property tests check that a one-sided change reproduces that side byte-for-byte.
- Conflicts go to a conflict file in the store; `envden resolve` with `--keep-mine` / `--take-server` / edit.
- **Second device's first run** (join flow): for each file that differs locally, choose keep mine / take server / merge. Never a silent overwrite.
- Status and diff output never shows values, only key names and change markers.

## Out-of-sync notice

- A line in the shell rc (zsh, bash, fish, PowerShell), added with consent. On shell start and `cd`, it prefix-matches the current folder against a cached list of approved checkouts and prints from a cache file. Only when the cache is older than 60 seconds does it start a detached refresh. It never runs git and never writes to checkouts.
- The binary is compiled with `.env` and `bunfig.toml` autoload disabled, and the hook calls it as `env -u BUN_OPTIONS -u BUN_BE_BUN /absolute/path/envden` (those variables bypass the compile flags).
- Every `envden` command also reports other out-of-sync repos. `envden status --json` for tools.

## Agents

- `envden agent install` puts one skill in `~/.agents/skills/envden/` (the shared format most coding agents read) and links it into `~/.claude/skills/` for Claude Code.
- Setup is agent-drivable like `t3 up`: every question has a flag, `--yes` takes defaults, and with no terminal and missing choices envden stops and lists the flags it needs. `envden status --json` and `envden doctor --json` report state.
- Agents never handle secrets or approvals: for the master password, a pairing code or approving a checkout, envden tells the agent to ask the user to run the step in their own terminal.
- Non-interactive pushes require `--yes`. Conflict resolution with `--keep-mine` or `--take-server` requires a terminal unless `agent-merge` is on. Conflicts are never auto-resolved for an agent; with `envden config agent-merge on`, the skill may help edit the conflict file (a convention, not a security boundary).
- Docs have a "Set up envden with your agent" page with one prompt to paste.

## Setup

- **Home lab first**: `docker run` with a Tailscale auth key and a data volume; the logs print a setup token. Then `envden setup` on a laptop: takes the token through a terminal prompt (token flags remain available but are visible to other processes), pins the server, creates the vault (master password, recovery kit), asks about telemetry and update checks, offers the shell line and agent skill, discovers repos, asks you to approve them, links and pushes.
- Re-running setup leaves existing edits for normal pull/push reconciliation. Initial-push recovery records bases only for this device's sequence-2 push when every included file still matches locally. A resumed creation must use the recovery kit issued for that pending vault.
- **Laptop first**: `envden setup` finds no server and offers to run one here as a login service. Later `envden server move`.
- **Other devices**: `envden join <server>` with a pairing code, or master password + recovery kit.
- **Repo discovery**: walk the chosen scan roots (default: home folder; add or remove roots) for `.git` directories, skipping junk folders; list worktrees with `git worktree list`. Warns that macOS may ask for folder access. Shows repos with env files as a checklist to approve. Later, the shell line offers once to track a repo it missed.
- Windows: setup tries to create a symlink; if that fails (no Developer Mode, admin-locked), it explains and offers copy mode with explicit consent.

Setup, server move and repair completion require a terminal for secret prompts; piping a token cannot complete them. Repair uploads accept a token on stdin. Replacement kits written with `--kit-out` are not printed unless the file write fails, in which case the kit is printed so it can be saved.

## Updates

- **Versions.** The CLI and server ship together under one semver. Each release sets `minServer` (in the CLI) and `minClient` (in the server). The server hello carries its version and `minClient`; every request carries the client's version.
- **Forced updates come from your server.** Updating the server can raise `minClient`. Older clients then get a clear "update envden" error on their next sync and nothing else breaks: placed files are links into the local store and keep working. `envden serve --min-client <version>` raises it further by hand.
- **Old server.** A client that needs a newer server says so and prints the update command for that server: `docker compose pull && docker compose up -d`, or `envden update` on a laptop server.
- **New formats are gated.** A new entry kind or format is only written once the server's `minClient` guarantees every syncing device can read it. A client says "update required" only for data whose signature it verified; anything else is reported as invalid.
- **`envden update`** uses the install method recorded by the installer: `brew upgrade`, `npm i -g envden@latest`, `scoop update`, `winget upgrade`, or, for the script install, a download checked against the hash in `SHA256SUMS` from the same release tag, a successful no-op if it isn't newer, and swapped in atomically (on Windows the old exe is renamed and deleted on next start). It then refreshes the shell line, the agent skill and, on a laptop server, restarts the service. `envden update --check` only reports and runs even when automatic checks are disabled. Downloads allow up to 30 minutes; the new binary must run before replacement. A failed post-install restores the old binary.
- **Update check.** Once a day the CLI resolves the latest stable GitHub release and caches the result in `~/.envden/state` (PROTOCOL § 15). Setup asks once, default on; `envden config update-check off` and `ENVDEN_NO_UPDATE_CHECK=1` turn it off. Failed lookups only appear in status and doctor output. The shell line shows "update available" at most once a day and "update required" when the server refuses sync, until a successful authenticated request clears it. A minimum above the latest release is reported without a persistent update notice.
- **Security releases.** A server can raise its signed `minClient` to require clients to update before syncing. Update downloads rely on GitHub and TLS for integrity.
- **Data migrations.** The server's database and the local store each carry a format number. A newer binary migrates forward on start, after copying the old data to `pre-<version>` backups. An older binary refuses newer data and tells you to update. Downgrades work only before any new-format data exists. `pre-<version>` copies are deleted after 30 days, since server copies hold the OPAQUE record.
- **Devices.** `envden device ls` shows each device's last-seen version. `envden status --json` reports `update.available` and `update.required`. Agents may run `envden update --check` but ask the user before updating.
- Protocol v2, if ever needed, ships as a server that speaks both; the hello lists supported versions, and a client never drops below the highest it has used with a vault.

## Telemetry

- CLI only, opt-in. Interactive setup asks once; non-interactive runs (`--yes`, agents, `join` without a terminal) leave it off. Change any time with `envden config telemetry on|off`; `ENVDEN_TELEMETRY=0` and `DO_NOT_TRACK=1` always win.
- Sent with a plain `fetch` (no SDK) to PostHog, project set to discard IP addresses and skip GeoIP. Docs say PostHog still sees the connection's IP.
- Sent: version, OS, command name, success/failure, an error code from a fixed list, counts, a random install ID. Never: raw error text or stack traces, repo IDs, file or key names, values, server address, network identity. Nothing is sent from the shell line.
- The server never sends telemetry.

## Distribution and site

- Homebrew, `curl | sh`, `irm | iex`, npm (`npm i -g envden`), Scoop. winget manifests are prepared but not yet published. Server image on GHCR, tagged by exact version, minor (`:1.4`) and major (`:1`); docs pin the major. MIT license. Self-host only.
- The static site CSP permits inline Next.js bootstrap scripts and component styles; scripts, search, fonts and images otherwise use the same origin.
- Site `envden.theclau.de` for now, from one `SITE_URL` constant. LLM-friendly docs: `llms.txt`, `llms-full.txt`, raw markdown per page, comparison pages (vs Infisical, dotenv-vault, DotVeil), agent setup page.
- 0.1.0 shipped as an alpha. Outstanding release validation is tracked in `packaging/README.md`.

## Not in v1

Team sharing, network adapters other than Tailscale, runtime-loaded plugins, importers, web UI.
