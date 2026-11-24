# envden design (v1)

Terms are defined in `CONTEXT.md`. Decisions, with the options they rejected, are under [Decisions](#decisions). Revised after three rounds of adversarial review by Codex (GPT-6.1 Sol) and Claude Fable 5.2.

## Problem

Developers keep env files (gitignored, often with comments) in many repos and worktrees across several machines. Secrets managers (Infisical, Doppler, Phase) store keys, not files, so comments, order and blank lines are lost. dotenv-vault is paid SaaS. Small file-syncing CLIs (DotVeil, enva, envman) are unmaintained or have broken crypto. envden syncs whole env files byte-for-byte, self-hosted, end-to-end encrypted, over the user's private network.

## Threat model

- **Server**: untrusted for confidentiality and integrity. It may read, drop, replay, reorder or forge anything it stores or relays. It can always deny service, and it can keep serving a device that was removed (that device still can't read new epochs). A server colluding with a removed device or an old recovery key can fork history, and a server alone can show different devices different branches (each device stops as soon as it sees the other branch); both residuals are documented.
- **Network**: the network adapter (Tailscale in v1) is transport only. envden trusts no identity it reports.
- **Devices**: trusted while they're members. A removed device keeps whatever it already pulled; envden can't revoke that and says so.
- **Lost or stolen device**: it keeps fetching and decrypting until another device removes it with `envden device rm`, which starts a new epoch it can't read. There is no unlock expiry. Files already on disk are protected by OS login and disk encryption, not by envden.
- **Stolen server database or backup**: holds ciphertext, the recovery envelope and the recovery proof key. Opening either needs the recovery code, which is 128 random bits, so it can't be brute-forced.
- **Checkouts**: not automatically trusted. A folder claiming a repo's remote doesn't get secrets until the user approves it once.

## Shape

- **Server**: one Docker container, or `envden serve` on one of the user's devices (launchd / systemd). Stores ciphertext and opaque IDs only. One server per vault, no peer-to-peer (see Decisions). Many vaults per server, one owner each.
- **Device**: the `envden` CLI, a single Bun-compiled binary for macOS and Linux. No background daemon.
- **Stack**: TypeScript monorepo on Bun (see Decisions). `apps/cli`, `apps/server` (+ Dockerfile), `apps/web` (Next.js + Fumadocs), `packages/core` (crypto, protocol, merge, adapter interfaces, `SITE_URL`), `packages/adapters/*`.
  - Monorepo: Bun workspaces. Tests: `bun test` plus the adapter contract tests (Vite+'s Vitest runs on Node, and the code uses Bun APIs). Format, lint and type check: Vite+ (`vp check`: Oxfmt, Oxlint, tsgolint). Unused code, cycles, duplication and complexity: Fallow. Wire messages validated with Zod.
  - CLI: `commander` with `@commander-js/extra-typings`, prompts from `@clack/prompts`, keys in owner-only files behind the keychain adapter, git via the `git` command.
  - Server: Hono on `Bun.serve`. Request signing, rate limits and the setup token are Hono middleware; the CLI uses Hono's typed client; tests call `app.request()` with no open port. SQLite via `bun:sqlite`.
  - Site: Next.js, Fumadocs, Tailwind, Motion for landing-page animations, hosted on Vercel.
  - Releases: GitHub Actions builds every platform binary and the Docker image, uploads one `.tar.gz` archive per platform and their `SHA256SUMS` file (PROTOCOL § 15); channels under Distribution.
- **Crypto libraries**: `@noble/ciphers`, `@noble/curves`, `@noble/hashes`; HPKE from `@hpke/core` (+ `dhkem-x25519`, `chacha20poly1305`). All pinned exactly, RFC test vectors in CI. No hand-rolled primitives. The BIP-39 English wordlist is vendored as data. The envden protocol that composes them (device list, manifest, wraps, word approval) is ours: specified in `PROTOCOL.md` with test vectors, and reviewed separately before release.

## Adapters

| Kind | Question | v1 | Later |
|---|---|---|---|
| Network | How devices reach the server, and how a share reaches the internet | Tailscale | NetBird, ZeroTier, LAN |
| Repo | Which repo is this checkout? | Git | Jujutsu, Mercurial, plain folders |
| Storage | Where the server keeps ciphertext | Local disk (SQLite + files) | S3, R2, MinIO |
| Keychain | Where a device keeps its keys | Private files (`0600` in a `0700` folder) | 1Password CLI |
| Placement | How files appear in a checkout | Link, copy | — |
| Shell | Out-of-sync line | zsh, bash, fish, PowerShell | nushell |

Interfaces live in `packages/core`; each adapter is its own package and must pass the shared contract tests. Built into the binary in v1; added by fork or PR. A template, a "write an adapter" docs page and an agent skill for writing adapters ship with the repo. Encryption, the sync protocol and merging are not adapters.

## Crypto

Exact constructions, encodings and test vectors go in `PROTOCOL.md`, written and reviewed before the crypto code. This section is the contract it must meet.

### Keys and signatures

- **Device keys**: each device has an X25519 key pair (encryption), an Ed25519 key pair for vault objects, and a separate Ed25519 key pair for server requests. Held via the keychain adapter, in owner-only files under `ENVDEN_HOME`, like SSH keys in `~/.ssh`.
- **Signatures are domain-separated**: every signature covers `label ‖ length-prefixed bytes`, with one label per object type (device-list entry, manifest, request, server hello). Requests bind the server pin, method, path, body hash, time and a nonce. Secrets (setup token, recovery code) are never sent; requests carry a MAC or signature over the signed request instead.
- **Epoch keys**: the vault key has generations. Each epoch has a random 256-bit key. New writes use the newest epoch; old data is never re-encrypted. Older epoch keys live in a keyring encrypted under the newest; the keyring's hash is in the manifest.
- **Wraps**: an epoch key is wrapped to each member with HPKE base mode (RFC 9180), info = vault ID ‖ epoch ‖ recipient. The wraps live inside the signed device-list entry that creates the epoch (or adds the device), with a key commitment each recipient checks.
- **ID key**: a separate, non-rotating key used only to make opaque IDs, kept in the keyring. Rotating epochs never renames anything on the server.
- **Recovery key pair**: X25519 + Ed25519, stored only inside the recovery envelope. It is a vault member that can receive epoch keys and can sign only "add device" (which is how a recovery join is recognised; there's no flag to fake).
- **Recovery code**: 128 random bits, generated at vault creation, shown once, never stored on any device.

### Vault creation

- The first device generates every key and secret locally, signs the genesis entry and the epoch-1 entry, and stores them before uploading anything. **Vault ID = hash of the genesis entry.** Nothing in a vault's root ever comes from the server.
- The setup token printed by the server embeds the server key's fingerprint. The device pins the server from it and checks a signed challenge before sending the token or anything else.

### Device list and manifest

- **Device list**: a hash-chained log of entries: genesis, add device, remove device, new epoch, replace recovery key, server moved, repair done, rename device. Each entry is signed by a key that is a member at the entry's parent.
- **Manifest**: a signed header (operation, previous manifest's hash, device-list head, epoch, keyring hash, hash of the file list) plus the file list (every file ID with its version, epoch, ciphertext hash and encrypted name; deleted files stay as tombstones).
- **One commit point**: a device-list entry takes effect only through a manifest swap naming it, done as one compare-and-swap. A push uploads ciphertext first, then swaps. If two devices race, the loser re-signs on the new head. A crash before the swap leaves nothing visible.
- **Accepting a manifest**: it must descend from the device's checkpoint by hash chain, be signed by a member at its device-list head, and never move the head or the epoch backwards. A branch that doesn't descend is a fork, whatever its counter (including a different manifest at the same number): envden stops and shows both sides. Manifest headers are never pruned, so descent can always be checked.
- **Freshness**: each device keeps the last manifest head it accepted. A word-approved device inherits the approver's checkpoint. A recovery-joined device starts from the envelope's checkpoint (below).

### Files

- XChaCha20-Poly1305 under a per-file key derived from the epoch key. Associated data binds vault ID, epoch, file ID and version; the signed manifest binds the ciphertext hash. Padded to 256-byte steps; max 1 MiB.
- The Repo ID and path travel encrypted in the file list and inside each file, so a device knows which files are its repos' without downloading the others; it recomputes the file ID to check them.
- **Opaque IDs**: file ID = HMAC(ID key, Repo ID ‖ path), so the same path in different repos doesn't correlate. The server still sees rough sizes, timing, device count and device names (the device list is signed, not encrypted); docs say so.

### Recovery code and envelope

- **Recovery code**: `ER1-` and 29 Crockford base32 characters in groups of five, with a 16-bit checksum that catches typos before anything is sent. Setup shows it once in the terminal with one line, "store this in your password manager; it's the only way back if you lose every device", and one confirmation. Nothing is written to disk unless `--recovery-code-out` names a new private file, for scripts.
- **Envelope key** = HKDF(recovery code, vault ID), labelled `recovery-envelope-key`. No Argon2id: the code is 128 random bits, so stretching adds nothing.
- The envelope contains the recovery key pair, the vault ID and the manifest it builds on; the manifest that installs it names its hash. It's sealed only in the swap that creates the vault or replaces the code, since devices never keep the code.
- **Proof key**: an Ed25519 key derived from the code alone, labelled `recovery-proof-key`. The server stores only its public half and finds the vault by it, so the user needs nothing but the server address and the code.
- **Join with the recovery code** (`envden join <server> --recovery`, every device lost): the device signs its request with the proof key, gets a one-use join ticket, fetches the envelope, verifies the device list from genesis to head, and checks its recovery key is the current recovery member. The recovery key signs "add device" for it. Every other device shows "*laptop* joined with the recovery code" on its next command. Failed attempts are rate-limited per vault; a valid proof is never locked out.
- **Replacing the code** (`envden vault recovery-code`, from any member): new recovery keys, a new epoch, a new envelope and a new proof key in one swap. The new code is shown before the swap is sent, and the swap is kept locally; a rerun finishes it if it committed and discards it if not. With every device and the code lost, the user creates a new vault from a device's local store.

### Word approval (join from another device)

- The new device runs `envden join <server>` and types nothing but its name. It opens a join request on the server carrying a commitment to its keys and a random nonce.
- Any device in the vault runs `envden device approve`; the pre-command notice and the shell line say when a device is waiting. It sends its own nonce and the vault ID, then the new device reveals its keys and nonce, and the approver checks they open the commitment.
- Both screens show the same three words from the BIP-39 list, derived from the vault ID, the server pin, the new device's record and both nonces. The approver asks "*laptop* wants to join. Words: tiger lamp river. Do they match the other screen? [y/N]", and the new device asks the same. On yes from both, the approver commits "add device" with the new device's wrap of the current epoch key, numbering a taken name (`laptop-2`), and the new device verifies everything from the server and adopts the committed name.
- Requests expire after 10 minutes. Either side answering no, or a commitment that doesn't open, cancels the request. Waiting doesn't hold the local state lock; `envden join --resume` collects an approval made while the new device wasn't running.
- The new device commits before the approver picks its nonce, and the approver's nonce is fixed before the reveal, so a server or another device on the network gets one online guess per attempt: a 2⁻³³ chance that its words match the user's screen. Every failed guess shows mismatched words.

### Renaming and removing devices

- `envden device rename <name>` renames the device it runs on. Only a device can rename itself, and the name must be free (no auto-numbering, since the user picked it).
- `envden device rm` lists what the device could read and asks to confirm, then commits "remove device" and a new epoch in one manifest swap. The new epoch key is wrapped to the remaining devices and the recovery key. Nothing is re-encrypted.
- Offline devices pick up the new epoch on their next pull and rebase pending edits onto it.
- If the removed device ever held the recovery key in memory (created the vault, joined with the recovery code, or replaced the code; envden works this out from history), envden recommends replacing the recovery code in the same step (one epoch, new code). Otherwise it trusts that the key was erased.
- The removed device can decrypt any ciphertext from its epochs that it obtains, including history it never pulled, and can test guessed file names with the ID key. envden lists every file and key name up to that epoch so the user can rotate those credentials.

## Server

- Listens on localhost behind `tailscale serve`. Every request is device-signed, so forged headers or local processes gain nothing. Tailscale identity headers aren't used (they're empty for tagged devices). Setup checks that HTTPS certificates are enabled on the tailnet. When Tailscale isn't ready, the network adapter names the cause (not installed, not running, logged out, no certificates) so setup can say what to fix. A hosted server is published on its own HTTPS port (4783, or a free port if that's taken), never on 443, so it can't take the machine's main address from another app; publishing never replaces something already served on that port.
- **Creating a vault** needs a one-time setup token printed in the server logs (`docker logs`, or the `envden serve` output). It embeds the server pin (see Vault creation). After that, only device signatures count. `envden setup --host-server` issues the token in-process, so hosting on the same machine never asks for it.
- Devices **pin** the server (a hash of its signing key) at setup or join, and store its address separately.
- History: every manifest and ciphertext version kept for 90 days, and at least the last 20 per file. Deletes are tombstones and outlive history pruning, so an offline device can't bring a deleted file back without an explicit restore. Repair-fix file lists, and the list before each, are kept forever. A list kept for one file's version keeps no other file's ciphertext, and a swap whose list adds no ciphertext and isn't bigger commits even over the storage quota, so deletes always work.
- **`envden history`** reads only what the server retains: verified headers, the file lists they name and the version blobs, decrypted on the device and shown as key names. History ends where lists or blobs were pruned. Restoring a version writes it locally as an ordinary edit; only a later push publishes it, and agents need `agent-merge` plus `--yes`.
- **`envden server move`**: opens a move session on the new server (setup token), freezes the old one (any member can unfreeze it before the switch), copies and verifies everything, including the recovery proof key, then commits a "server moved" device-list entry (old pin, new pin, new address) on the old server, which turns read-only, and the same on the new one. Every step can resume after a crash, from any member if the moving device is lost; it can abort until the final commit. The entry is signed by a member device, never by a server. Devices that see it switch, remember it, and never accept the old server again, even if it's restored from a backup. A device accepts the new server only if its manifest descends from the local checkpoint. `envden server switch <address>` follows the move when the old server is gone, with ordinary signed requests.
- Backups: everything in the data folder is ciphertext or public keys; the recovery envelope and proof key need the 128-bit recovery code, so a stolen backup can't be brute-forced. A stopped server leaves one file, `envden.sqlite`, on every platform, so copying it is a complete backup. Docs include a tested restore: `envden serve --restored` prints a repair token per vault and accepts nothing but repairs. Each device runs `envden server repair` with the token, re-uploading its newer signed history and its repos' files. `--finish` checks every device's signed report itself and needs every device to have repaired or be dropped (`--without`; it rejoins later as a new device, keeping its local files), then closes the repair. If the recovery code changed after the restored point, the server can't vouch for it, so envden asks to replace it. Run `--restored` once by hand, not from the service definition: rerunning it mints a new token, which voids reports made with the old one. A backup taken mid-move is unfrozen, which voids that move; an unfinished move destination and a vault that moved away aren't put in restored mode. A file whose newest version no device holds is listed by name; with `--accept-lost` it goes back to the newest verified older version, or is marked lost, and every device reports it.
- **Status page**: `GET /` (and `/v1/status` as JSON) is unsigned, since anyone on the tailnet can open it. It shows only server-wide facts: version, uptime, mode (normal, restored, moved), vault count, total storage, the fullest vault's quota band and the last prune. Nothing per vault. `ENVDEN_STATUS_PAGE=off` turns it off.
- Laptop-hosted servers are supported; setup recommends an always-on host, since two laptops only sync while the server laptop is awake. An unreachable server never blocks local work; status shows "server unreachable".

## Store, checkouts and placement

User-owned tool directories remain outside envden's control if the user personally symlinks their tools into a checkout.

- Store: `~/.envden/store/<repo-id>/<path-in-repo>/<file>`; checkpoint, history and update cache in `~/.envden/state/` (never rolled back by a store backup); bases in `~/.envden/base/`, conflict files and pre-overwrite backups in `~/.envden/conflicts/` (backups, quarantined corrupt records and interrupted-write temporary files deleted after 30 days on sync; conflict files deleted on resolution). Folders 0700, files 0600.
- **State lock**: every read-change-write of device state runs under one lock, `~/.envden/state/write.lock`. Nested calls in the same operation reuse it; other commands retry briefly, then fail with `CONFLICT`. Dead owners, reused PIDs and owners from an earlier boot of the same host are reclaimed. An owner recorded with a different or missing machine identity, or any owner when this machine's identity can't be read, keeps its lock for 24 hours; a live owner on this machine keeps it until it exits. Release removes only the caller's own lock.
- Active bases and pending placements remain until replaced or resolved; no plaintext lineage archive is kept. Retention uses the command's supplied time and covers nested state and base directories. Corruption markers remain until recovery, even after their backup expires.
- **Repo ID**: from `git remote get-url origin` (falls back to the only remote, else asks), with the user's global `url.<base>.insteadOf` rewrites applied but no other global config. Host aliases resolved with `ssh -G`, host lowercased, port dropped (ssh and https clones of one repo usually use different ports; the cost is that two git servers on one host with the same repo paths share env files, which an alias can't separate), path lowercased for hosts with case-insensitive paths (GitHub, GitLab), full path kept (subgroups, Azure DevOps), `.git` stripped. Ships with test vectors.
- **Approved checkouts**: the first time env files would land in a checkout, envden asks in the terminal. `--yes` doesn't skip it. Every new canonical checkout root or recreated checkout needs approval saved outside the checkout in envden state. A registered worktree of a clone whose own checkout is approved is approved without a prompt on its first `pull`, `push` or `track`, recorded in state with a report line so `untrack` can remove it. That is safe by default because a registered worktree lives in the approved clone's own `.git`, so creating one already needs write access to that clone. Separate clones, recreated checkouts, changed remotes and worktrees of unapproved clones still prompt. `envden config auto-approve-worktrees off` restores the prompt; turning it back on needs a terminal, like `agent-merge`. A changed remote never silently remaps an approved checkout.
- **Env files**: `.env` and `.env.<name>`, excluding templates (`.example`, `.sample`, `.template`, `.defaults`) and never `.envrc`. Only files git ignores; skips build output folders (`node_modules`, `.next`, `dist`, `build`, …). `envden config env-files '{"include":[".env",".env.*"],"exclude":["*.example","*.sample","*.template","*.defaults"],"extraSkipped":["generated"]}'` replaces the filename include/exclude patterns and adds skipped directory names. Patterns without `/` match basenames; others match checkout-relative paths. Refuses tracked files and always excludes `.envrc`.
- Before linking, `git check-ignore` must pass, else envden adds the path to the checkout's exclude file (resolved through git, so worktrees work).
- Case and Unicode aliases are checked in UTF-16 lexical path order within each repo; a later conflicting spelling is held back with its original path.
- Pulled paths are validated: no `..`, no absolute paths, `lstat` before writing, no following symlinks out of the checkout.
- Placement uses directory handles; unavailable FFI retains a parent-swap race after the final path check.
- Replacing a regular file with different bytes first backs it up to `~/.envden/conflicts`, outside the checkout; a backup never becomes checkout content. Equal bytes and existing store links need no backup. Removal refuses unrelated symlinks and unsafe parents.
- Monorepos: `apps/web/.env` maps to `<repo-id>/apps/web/.env`.
- Forks: when an `upstream` remote's Repo ID already has envs, ask once to alias, only if no checkout of the fork already has placed files. There is no manual alias command (see Decisions).
- **Link mode** (default): a symlink into the store. All links to one store file share one base.
- **Copy mode**: real copies, each with its own base; push detects changes against it, including a revert to any earlier version. Requires explicit consent when symlinks aren't available, and is offered once per checkout, interactively, when its root contains `.devcontainer/`, `docker-compose*.yml` or `Dockerfile`. `envden track --copy` selects it explicitly; `envden config placement <path> link|copy` saves the checkout preference.
- **Local only**: a checkout can mark a file as deliberately different (e.g. `PORT` per worktree). It becomes a copy that is never pushed or pulled, with no nagging.
- **Detached checkouts**: if a link was replaced by a regular file (atomic save, `sed -i`, `cp .env.example .env`), envden relinks if the content matches the store. At a tracked target, different bytes are a newer user edit, including a revert. If the store still matches its recorded local bytes, envden adopts those bytes and relinks; if the store also has a different unpushed edit, both versions become one conflict. Untracked targets never replace the store silently. The shell line never does this.
- Docker builds: docs show `.dockerignore` and BuildKit secret mounts. Copy mode is not recommended for builds.

## Sync

A device must leave its current vault before joining another. There is no leave/reset command yet: back up env files, remove the local envden home, then join. Remove the old device from the old vault separately.

`envden rm <path>` removes one tracked env file from all local targets and the store, backs up content and conflicts, and publishes a tombstone on the next push. It asks for confirmation including discarding local edits; non-interactive use requires `--yes`. Removal intent is written only after local removals succeed and names the server entry and the targets actually removed. Surviving skipped targets do not cancel that intent when approved later. Changed entries require confirmation through conflict resolution. Untracking removes that checkout from the intent; it cancels and reports removal only when no tracked checkout remains for the store. Restoring bytes in a removed target or the store cancels pending removal and reports it; resolving to live content clears intent. Unpublished removal only untracks locally. Checkouts needing approval are skipped and reported. Missing store files and targets are restored, never interpreted as deletion. Only explicit removal or resolution choosing a deletion side may publish a tombstone.

A pending placement records the verified manifest header, encoded server entry, and hashes of every place before writing and whether each place was written. Resume completes it only at that checkpoint while unwritten places match their original or intended content and written places still match the intended content, then marks that entry applied. A superseded operation is dropped after recovering the bases of places marked written. A place already equal to the intended bytes counts as written even if its written mark was interrupted. Changes to written places are user edits; other unwritten places must still match their original bytes. Untracking also preserves the store’s pending ancestor before removing the operation. Each completed store write records its server ancestor before placing copies, so partial placement cannot disguise server bytes as an edit. Uploads require the current server entry to have been applied locally. Attempted uploads record the proposed header and entries before sending; a header anywhere in the verified chain acknowledges the attempt, including superseded attempts, in sequence order. Each attempt names exactly the reconciled places and their intended ancestors. Its checksum is checked before it can acknowledge or reject local work. Acknowledgement updates only those ancestors and rebinds a later removal to the acknowledged entry; it clears removal only for an acknowledged tombstone. Acknowledged and proven rejected attempts are removed. Rejected content remains an unpushed edit.

Corrupt per-file sync records are moved to a named backup and hold the file in conflict until resolved; status reports the hold and untrack remains available. A corrupt device-wide applied-entry map raises a named error. Back up local env files, move the named applied-files.json aside, then run pull and resolve any conflicts before pushing.

### One file on one device

- Lineage is device-local and durable. Only current agreement and unsettled work are retained; there is no separate lineage archive. The store records its server ancestor independently of the file-wide applied entry. The store and each copy also keep the last reconciled local bytes, so a revert after an observed unpushed edit remains an edit. An edit and revert between commands that leaves exactly the recorded bytes is indistinguishable from no edit. Comparing a place with its own recorded version distinguishes an unchanged stale place from a user edit. An unchanged ancestor fast-forwards without uploading. Bytes changed after agreement remain an edit even if they equal older lineage content, so deliberate reverts push. The newest agreed ancestor supplies the three-way merge base.
- The server entry is live content, a tombstone, or absent. The device separately records the entry it applied; its decrypted content comes from the local blob cache, never a target's base.
- There is one shared store file and N targets. A link's content is the store itself; a copy has its own bytes and a base last agreed with the store.
- Decide once for all targets before writing. Only a tracked copy with a recorded base equal to the current store may replace the store, and only when its bytes differ from that base. A copy still equal to its base follows the store. Different non-base bytes in two places conflict.
- A link is the store by definition. A regular file replacing a tracked link is a newer user edit. Equal bytes relink; different bytes replace an unchanged store, including a revert to older bytes. Different unpushed edits in the store and detached target conflict.
- Untracked targets and tracked copies without a base never win silently. Bytes equal to the store or applied server content adopt the store; different bytes require a choice or a reported conflict. `--yes` does not approve them.
- Missing copies are restored from the store on pull and push, like missing links. Removing a target is not a request to delete the file everywhere. Use `envden rm <path>` to delete it everywhere on the next push.
- Persist the chosen content before changing the store, and retain that operation until placement and bases finish. Retrying an interrupted merge writes only unfinished places that still match their recorded before content or intended result; completed places must still match the intended content. Content and directory entries are durable before state references them; unchanged durable bytes need no rewrite.
- Keep one conflict per file, with recorded mine and theirs. The mine side follows the origin of the edit: a changed store or pending removal is mine; an edited copy is mine when sync changed the store. The store holds a user edit when it differs from its recorded base, or when it equals recorded bytes but differs from its previous server ancestor. That unpushed store edit stays mine and an edited copy is saved as a variant. When the server already holds that owning side, the next differing local version is mine, so mine never equals theirs. Theirs is always the actual server state. Every other local version is saved, and `resolve --list` names the saved paths. Resolution uses saved bytes, touches only still-approved, present targets, and keeps its record until placement and bases finish so retry can complete. Untracking or pruning a checkout removes its conflict targets. Editing an absent mine keeps a deletion unless the user creates the conflict file.
- Repeating pull changes nothing. Unpublished files have no server base. After an applied deletion, tracking an old worktree's surviving env file is a deliberate re-add and publishes it again.

- Explicit only. `envden push` / `envden pull` in a checkout act on its repo; `--all` acts on everything in one manifest swap.
- A push names the manifest head it was based on; the server rejects it if the head moved (compare-and-swap). Requests are retry-safe. Local operations on a store file are serialized with a lock.
- Missing or recreated checkouts are skipped with a notice to run `envden track`; a changed remote requires `envden untrack <path>`, then `envden track <path>`. Cancelling a reconciliation prompt aborts the command.
- An applied server tombstone is an agreed base: newly tracked local content can deliberately re-add the file. A device that has not applied the deletion conflicts instead; resolving that conflict records the agreement.
- Pull never overwrites unpushed local edits: those go through merge. A backup is kept before overwriting bytes that differ from the applied server version, and reported with the checkout path. Bytes equal to that version are already in server history and get no backup.
- Each device keeps the ciphertext of files it uses, so it can repair a restored server for those repos. It never fetches other repos' files; their names come from the file list.
- **Merge**: each entry is the raw bytes of one key's assignment (including its comments), compared as bytes, never as parsed values. The local file is the layout; keys added remotely go at the end in remote order, and lines a merge brings in from remote take the local file's line ending. A leading UTF-8 BOM belongs to no entry and is kept unless one side alone changed it. One-sided changes and identical local and remote files are accepted byte-for-byte before parsing, including unsupported syntax or style changes; key names are reported only when both base and result parse. Final line terminators do not count as key changes. Keys changed on one side merge. A comment block moved to different keys on both sides is a layout conflict. Anything ambiguous becomes a whole-file conflict: a key changed on both sides, delete vs edit, duplicate keys, unterminated quotes, multi-line values, `export` or quote-style changes, a comment toggled against an edit. Clean merges are shown (key names only) and confirmed. Property tests check that a one-sided change reproduces that side byte-for-byte.
- Conflicts go to a conflict file with git-style markers labelled `this device` and `server (from <device>)`. When only some keys conflict, the markers wrap just those keys and the rest is merged; otherwise they wrap both whole files. A deletion side gets no markers. Pull prints one line per conflict with the checkout path. `envden resolve` takes `--keep-mine`, `--take-server` or the edited file, and refuses an edit while markers remain.
- **Second device's first run** (join flow): for each file that differs locally, choose keep mine / take server / merge. Never a silent overwrite.
- Push reports each held-back path, its reason and the next action. Status computes held-back paths from current local approvals, rules, conflicts and placement state. JSON carries the same reports. Backup reports name the checkout path and saved path. Missing unpublished link content is a reported per-file failure. Status and diff output never show values, only key names and change markers.

## Shares

- `envden send [file]` hands one file to someone who may have no envden and no tailnet. The envden server isn't involved and stays private. `envden receive <link>` is the terminal path for people who do have envden.
- **Only while sending.** The sender's own CLI serves the share from a listener on `127.0.0.1` that answers nothing but `/s/<id>`, and the network adapter publishes that one path on the internet (Tailscale Funnel on the first port of 10000, 8443 and 443 that the tailnet policy allows and nothing serves). The funnel runs in the foreground as a child of `send`, so it ends with the command: on the first claim, at the end of `--ttl` (10 minutes by default, at most 60), on Ctrl-C, or on any error. Only a `kill -9` of envden leaves the child running, and the link then reaches a closed port until that process ends.
- **What becomes public.** The node's `ts.net` name, which is already in certificate transparency logs once HTTPS certificates are on, and one unguessable path for the life of one share. A port anything already serves, private or public, is skipped, and `send` refuses when every allowed port is taken: a foreground funnel there would hide that service for the whole share, and Tailscale makes a port either wholly private or wholly public, so publishing beside it is not an option. Funnel needs the `funnel` node attribute; without it `send` stops and shows the policy line to add.
- **No dead links.** A node's first public DNS record can take up to 10 minutes. `send` shows a spinner until the zone's own nameservers answer for the name, asking them directly so a "no such name" cached by a public resolver can't hold the link back. If DNS can't be asked from this network, it prints the link with a warning instead.
- **The link is the credential.** Whoever opens the whole link first gets the file, and the sender only learns that it was claimed. The key travels in the fragment, so neither Tailscale nor the listener sees it. Viewing the page never consumes the share; only pressing Open does, so chat previews and link scanners that fetch pages don't burn it.
- **The page** is one HTML document with its script and style inline, pinned by CSP hashes under `default-src 'none'`, sent with `no-referrer`, `no-store` and `noindex`. It decrypts with WebCrypto, shows the file read-only with Copy and Download, and clears the fragment from the address bar once the file arrives.
- `receive` asks before replacing a file, and refuses without a terminal, before it claims: the link works once, so refusing afterwards would lose the file. It writes through symlinks with mode `0600`.
- Telemetry gets the command and its outcome only. Bug reports mask everything after `#` in arguments, and errors never carry the link, key or contents.

## Out-of-sync notice

- A line in the shell rc (zsh, bash, fish, PowerShell), added with consent. On shell start and `cd`, it prefix-matches the current folder against a cached list of approved checkouts and prints from a cache file. Only when the cache is older than 60 seconds does it start a detached refresh. It never runs git and never writes to checkouts.
- The binary is compiled with `.env` and `bunfig.toml` autoload disabled, and the hook calls it as `env -u BUN_OPTIONS -u BUN_BE_BUN /absolute/path/envden` (those variables bypass the compile flags).
- Every `envden` command also reports other out-of-sync repos. `envden status --json` for tools.
- The cache also names keys a tracked env file lacks compared with its template sibling (`.env` against `.env.example`, then `.sample`, `.template`, `.defaults`): `envden: api/.env missing STRIPE_KEY, DB_URL (from .env.example)`, at most three names and a count. Extra keys appear only in `status` and `doctor`.

## Agents

- `envden agent install` puts one skill in `~/.agents/skills/envden/` (the shared format most coding agents read) and links it into `~/.claude/skills/` for Claude Code.
- Setup is agent-drivable like `t3 up`: every question has a flag, `--yes` takes defaults, and with no terminal and missing choices envden stops and lists the flags it needs. `envden status --json` and `envden doctor --json` report state.
- Agents never handle secrets or approvals: for the recovery code, comparing join words or approving a checkout, envden tells the agent to ask the user to run the step in their own terminal.
- Non-interactive pushes require `--yes`. Conflict resolution with `--keep-mine` or `--take-server` requires a terminal unless `agent-merge` is on. Conflicts are never auto-resolved for an agent; with `envden config agent-merge on`, the skill may help edit the conflict file (a convention, not a security boundary).
- Docs have a "Set up envden with your agent" page with one prompt to paste.
- **`envden ui`** is a local dashboard, not a daemon: it starts only from a terminal, so an agent can't use it to bypass terminal gates, listens on 127.0.0.1 for one run, and needs that run's random token from the printed link. It refuses foreign `Host` headers and cross-origin writes and shows key names only. Pull, push and conflict resolution take the state lock per action, like the CLI; approving a device and showing a recovery code stay in the terminal.

## Setup

- **Home lab first**: `docker run` with a Tailscale auth key and a data volume; the logs print a setup token. Then `envden setup` on a laptop: takes the token through a terminal prompt (token flags remain available but are visible to other processes), pins the server, asks for the device name, creates the vault and shows its recovery code once, asks about telemetry and update checks, offers the shell line and agent skill, discovers repos, asks you to approve them, links and pushes.
- Re-running setup leaves existing edits for normal pull/push reconciliation. Initial-push recovery records bases only for this device's sequence-2 push when every included file still matches locally. A resumed creation must have both vault keys; it resubmits the stored request and then replaces the recovery code at once, since the device never kept the first one and the user may never have seen it. Creation stays pending until a code is delivered, and a creation that already committed resumes without the consumed setup token. Missing keys restart creation before any upload.
- **Laptop first**: `envden setup` finds no server and offers to run one here as a login service. Later `envden server move`.
- **Other devices**: `envden join <server>`, approved from a device already in the vault by comparing words, or `envden join <server> --recovery` with the recovery code. A committed local vault cannot be replaced by joining another vault; an abandoned creation can.
- **Device name**: `--name` wins. Otherwise the hostname without its domain (`.local`, `.lan`, …) is suggested: a terminal shows it pre-filled to accept or edit, and runs without a terminal take it as is. A name already in the vault gets `-2`, `-3`, … when the device is added.
- **Repo discovery**: walk the chosen scan roots (default: home folder; add or remove roots) for `.git` directories. The walk never enters hidden folders, dependency folders (`node_modules`, `Pods`, `venv`, …) or the folders inside a found checkout, since nested clones there are vendored code. Build output (`target`, `build`, `dist`, `vendor`) is skipped only inside a project folder (one with `.git`, `package.json`, `Cargo.toml` and the like), and home-level tool and media folders (`Library`, `snap`, `go`, `miniconda3`, `Movies`, …) only directly in the home folder, so `~/target/svc` or `~/Work/go` is still found. A folder is judged by its own name, so a link `~/code -> ~/.projects` is walked. A `.git` folder git can't identify (a stray `git init` in `~/code`) doesn't stop the walk. Hidden folders hold tool state (`~/.codex`, `~/.gradle`), not projects; a hidden scan root is still walked. Worktrees come from `git worktree list` (skipping prunable ones; newline output on git before 2.36, which lacks `-z`), so agent worktrees under `~/.t3` or `~/.codex` are found without walking those folders; submodules come from git's own parse of `.gitmodules`. A repo whose worktrees or submodules can't be listed is still found and never stops the scan. A TTY shows a spinner with a running count. Skipped repos are counted in one line, `--verbose` lists them. Warns that macOS may ask for folder access. Shows repos with env files as a checklist to approve. Later, the shell line offers once to track a repo it missed.
- Links unavailable: setup tries to create a symlink; if that fails, it explains and offers copy mode with explicit consent.

A recovery code is shown only in a terminal, never where only an agent would see it; without one, setup and code replacement need `--recovery-code-out <file>`, which writes the code to a new owner-only file and never overwrites. Join approval and `join --recovery` need a terminal. Tokens can be piped on stdin.

## Updates

- **Versions.** The CLI and server ship together under one semver. Each release sets `minServer` (in the CLI) and `minClient` (in the server). The server hello carries its version and `minClient`; every request carries the client's version.
- **Forced updates come from your server.** Updating the server can raise `minClient`. Older clients then get a clear "update envden" error on their next sync and nothing else breaks: placed files are links into the local store and keep working. `envden serve --min-client <version>` raises it further by hand.
- **Old server.** A client that needs a newer server says so and prints the update command for that server: `docker compose pull && docker compose up -d`, or `envden update` on a laptop server.
- **New formats are gated.** A new entry kind or format is only written once the server's `minClient` guarantees every syncing device can read it. A client says "update required" only for data whose signature it verified; anything else is reported as invalid.
- **`envden update`** uses the install method recorded by the installer: `brew upgrade`, or, for the script install, an archive download checked against the hash in `SHA256SUMS` from the same release tag, a successful no-op if it isn't newer, and swapped in atomically. The binary is read from the archive in memory; any file, link or directory other than the `envden` file and `LICENSE`, including paths with `..`, fails the update, and neither the archive nor its contents may pass 256 MiB. It then refreshes the shell line, the agent skill and, on a laptop server, restarts the service. `envden update --check` only reports and runs even when automatic checks are disabled. Downloads allow up to 30 minutes; the new binary must run before replacement. A failed post-install restores the old binary.
- **Update check.** Once a day the CLI resolves the latest stable GitHub release and caches the result in `~/.envden/state` (PROTOCOL § 15). Setup asks once, default on; `envden config update-check off` and `ENVDEN_NO_UPDATE_CHECK=1` turn it off. Failed lookups only appear in status and doctor output. The shell line shows "update available" at most once a day and "update required" when the server refuses sync, until a successful authenticated request clears it. A minimum above the latest release is reported without a persistent update notice.
- **Security releases.** A server can raise its signed `minClient` to require clients to update before syncing. Update downloads rely on GitHub and TLS for integrity.
- **Data migrations.** Server database migrations save a `pre-<version>` backup before changing an existing database. Backups expire after 30 days, since they hold vault data. The server refuses incompatible database formats. The CLI's local state must match the current strict format; it has no migration or automatic backup mechanism and rejects other formats as "Unreadable local state".
- **Devices.** `envden device ls` shows each device's last-seen version. `envden status --json` reports `update.available` and `update.required`. Agents may run `envden update --check` but ask the user before updating.
- Protocol v2, if ever needed, ships as a server that speaks both; the hello lists supported versions, and a client never drops below the highest it has used with a vault.

## Telemetry

- CLI only. Interactive setup asks, with Yes selected, so a person sees the choice and can say no; it's never on without a person answering. Non-interactive runs (`--yes`, agents, `join` without a terminal) leave it off. Change any time with `envden config telemetry on|off`; `ENVDEN_TELEMETRY=0` and `DO_NOT_TRACK=1` always win.
- Sent with a plain `fetch` (no SDK) to PostHog. Each event sets `$ip` to null and disables GeoIP, so nothing about the network identity is stored; docs say PostHog still sees the connection's IP while receiving it.
- A detached `envden telemetry-send` process sends the event after the command exits. It skips everything else a command does (state, notices, update checks), so it can't consume a notice meant for the user, and it gets the proxy and CA variables (`HTTPS_PROXY`, `NO_PROXY`, `SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS`, …) that the trusted-process environment otherwise drops. A request to PostHog takes about 0.7 s over a fresh HTTPS connection, longer than any delay a command should add, and the earlier 200 ms in-process timeout meant no event ever arrived.
- Sent: version, OS, command name, success/failure, an error code from a fixed list, counts, a random install ID. Never: raw error text or stack traces, repo IDs, file or key names, values, server address, network identity. Nothing is sent from the shell line.
- The server never sends telemetry.
- The website runs PostHog with `cookieless_mode: "on_reject"`: page views are cookieless until a visitor accepts the consent banner, and only then do autocapture, session replay (inputs masked), heatmaps and error capture run. Declining keeps it cookieless. Requests go through the site's own `/ingest` rewrite so the CSP stays `'self'` (plus `worker-src blob:` for the replay worker). The PostHog project is dedicated to envden, records only on the site's domain and drops IP addresses on ingestion.

## Distribution and site

- macOS and Linux only (see [Decisions](#macos-and-linux-only-no-windows-or-npm)). `curl | sh`, Homebrew, and the release archives (arm64 and x64; glibc and musl on Linux), each a `.tar.gz` holding the `envden` binary and `LICENSE` (see [Decisions](#release-assets-are-gzipped-archives-built-with-the-pinned-bun)). The release workflow publishes the Homebrew formula. Server image on GHCR, tagged by exact version, minor (`:1.4`) and major (`:1`); docs pin the major. MIT license. Self-host only.
- The static site CSP permits inline Next.js bootstrap scripts and component styles; scripts, search, fonts and images otherwise use the same origin.
- Site `envden.theclau.de` for now, from one `SITE_URL` constant. LLM-friendly docs: `llms.txt`, `llms-full.txt`, raw markdown per page, comparison pages (vs Infisical, dotenv-vault, DotVeil), agent setup page.

## Decisions

When a decision changes, rewrite its entry here and say what it replaced.

### Release assets are gzipped archives built with the pinned Bun

Replaces raw binaries as release assets. A compiled binary is about 67 MB, of which envden's own code is under 3 MB; the rest is the Bun runtime. gzip cuts the darwin-arm64 download to about 26 MB. xz would reach about 17 MB, but Bun can't read it, so self-update would need another dependency or the system `xz`, which minimal Linux images often lack. gzip unpacks with the stock `tar` on macOS, GNU and BusyBox, and Homebrew unpacks it natively. Archives use fixed modes, owner and timestamps so a rebuild hashes the same. Bun's own `Bun.Archive` can't set the executable bit or report links, so node-tar writes and reads them.

The runtime also grows between Bun releases: a hello-world binary is 63.9 MB on 1.4.0 and 87.4 MB on 1.4.5. Release builds refuse to run on any Bun other than the `packageManager` version, which CI installs, so a Bun upgrade is a deliberate change that checks the size.

### Template checks compare key names only, locally

A tracked env file is compared with its template sibling by key name, using the merge parser with duplicates allowed. A key commented out in the template is optional, so it is neither missing nor extra. No template, or one the parser can't read, means no report. Values never leave the comparison, including in `--json`. Missing keys reach the shell line because they break the app; extra keys are often deliberate local settings, so they stay in `status` and `doctor` to keep the shell quiet. Nothing is sent to the server.

### macOS and Linux only; no Windows or npm

Replaces builds for Windows x64 and arm64, a PowerShell installer, and npm, Scoop and winget packages. Windows needed its own process lock, login service, ACL and shell-profile code, and CI had already stopped running its tests because the job passed the time limit. The npm package only wrapped the same binary in a Node launcher. envden is alpha with no Windows users, so these were cut rather than kept half-tested. The CLI ships as release binaries for macOS and Linux, installed with `install.sh` or Homebrew, and the server also ships as a Docker image. `envden update` replaces a script install in place and runs `brew upgrade` for Homebrew.

### Stable path collision selection

Collision checks use UTF-16 lexical path order, replacing first-seen selection in keyed file-ID order. Fresh vault keys must not change which case or Unicode alias is held back on the same filesystem. Paths retain their original spelling; only the collision comparison normalizes Unicode and, on case-insensitive filesystems, case. Signed file entries remain ordered by file ID.

### Aliases come only from the fork prompt

The only way to alias a Repo ID is accepting the fork prompt during `track` or `setup`. This replaced the `envden alias <repo> <target>` command, which also covered renamed or moved repos. A renamed repo is untracked and tracked again under its new Repo ID instead.

### One server per vault, no peer-to-peer

Each vault has exactly one authoritative server at a time; devices push and pull only through it. Peer-to-peer (Syncthing-style) was rejected: every device could hold a divergent version with no source of truth, which makes conflicts hard to reason about. Users without a home lab run the server on one of their own devices and move it later with `envden server move`.

### TypeScript on Bun, not Go

Go with Tailscale's `tsnet` was the obvious choice, but the maintainer can't read Go and needs to audit the code. So envden is a TypeScript monorepo on Bun, which compiles the CLI to one binary per platform. Instead of embedding Tailscale, the server listens on localhost and sits behind `tailscale serve`. Tailscale identity is at most a coarse gate; device-signed requests are the real authentication. NetBird, ZeroTier or a device-token network adapter can be added without touching sync or crypto, because the network only gates access to ciphertext.

Go and Rust ports were tried on side branches and removed, along with the parity harness that compared them. Nobody could review them, and a crypto port that isn't reviewed puts the zero-knowledge claim at risk. A smaller native binary, if people ask for one, will be a new port that gets a proper review, not a revival of those branches. The old trees are kept as the `archive/port-go` and `archive/port-rust` tags.

### Built-in adapters; crypto, sync and merge are not pluggable

Adapters are compiled into the binary and added by fork or PR. Runtime-loaded plugins are deferred because a plugin in a secrets tool can read every plaintext env file. Encryption, the sync protocol and merging are not adapters, since a swappable crypto layer is how secrets tools get broken.

### Worktrees of an approved clone need no prompt

Replaces "worktrees get a shorter prompt but are never approved automatically". Agents open worktrees all day, and the prompt guarded nothing: a registered worktree lives in the approved clone's own `.git`, so making one already needs write access to that clone. On by default; `auto-approve-worktrees off` brings the prompt back, and only a terminal can turn it on again.

### Tokens are one unbroken word

Replaces `envden-setup-1:<base32>` text. A double-click stopped at the `-` and `:`, so users copied half a token and got a protocol error after typing their password. The kind and version moved into the first encoded byte; tokens are checked as soon as they're entered.

### Conflict files carry both versions

Replaces a conflict file holding only this device's version, with every saved copy listed on pull. Running `envden resolve` on that file kept this device's version and silently dropped the server's change. The file now has git-style markers around both versions, and resolve refuses it until they're gone. Pull prints one line per conflict; `resolve --list` and `--json` name the saved copies.

### Backups only for unsynced bytes

Replaces a backup, and a printed line, before every overwrite. Each clean pull printed a store path and a backup path for a file the user never edited, which buried the backups that mattered. Bytes equal to the applied server version are recoverable with `envden history`, so only other bytes get a backup.

### Bug reports go through the user's own coding agent

When envden fails on its own bug in a terminal, it offers to start the user's installed coding agent (Claude Code, Codex or Gemini CLI) on a redacted report, or to open a pre-filled GitHub issue. An agent can read the logs and envden's source and find a cause before anything is filed, which a stack trace alone can't. It runs from the user's PATH with their environment, outside the trusted-process rule, because the user picked it. Rejected: uploading crash reports, since there is no envden backend and telemetry carries no raw errors; filing issues from envden through the GitHub API, which needs a token and skips the user's review. The offer only covers error codes the user can't fix, and never appears without a terminal, inside an agent, or with `ENVDEN_NO_REPORT=1`.

### One recovery code replaces the master password and kit

Replaces a master password registered on the server with OPAQUE, a secret key printed in a PDF recovery kit, and unlock periods with fresh-login gates. Setup asked for a password twice and produced a PDF to file away, and every new device, unlock and sensitive action asked for the password again, for a tool that syncs `.env` files. Now setup makes one recovery code: 128 bits from the CSPRNG, typed as `ER1-` and grouped base32 with a checksum. Because it's that strong, HKDF seals the envelope (no Argon2id), and the server keeps only the public half of a proof key derived from it. Everything a fresh login used to gate needs a member's signature instead, and the recovery path needs a proof of the code. The proof key isn't salted with the vault ID, because the server must find the vault from the code alone.

Accepted costs: there's no unlock expiry, so a stolen device keeps syncing until another device removes it (expiry only ever held against an honest server); and the code opens the vault on its own, so it belongs in a password manager. Rejected: keeping a password just for unlocking, which keeps the cost for little gain; a memorable passphrase, which a stolen database could guess offline.

### The recovery code is shown once in the terminal

Replaces a PDF recovery kit saved to Downloads, with only its path in the terminal. The code is one line meant for a password manager, so a PDF was a detour and one more file to delete. Setup prints it once with a single confirmation and writes nothing; `--recovery-code-out` writes a new owner-only file for scripts. Without a terminal, envden refuses to show it, so an agent never sees it. Accepted cost: terminal text can stay in scrollback. Rejected: keeping pdf-lib and its fonts for one line of text.

### New devices join by comparing three words

Replaces a typed pairing code checked with OPAQUE. The new device runs `envden join <server>` and types nothing; any device in the vault runs `envden device approve`. The new device commits to its keys and a nonce before the approver sends its own nonce, then reveals them, so neither side can steer the three BIP-39 words both screens show: a server or a racing device gets one online guess, matching with probability 2⁻³³. Both screens ask: the approver's question protects the vault, and the new device's protects its own env files from being pushed into a vault a server made. Join requests are server-wide because the new device knows only the server; a member of another vault there can see a request's display name and claim it, which at worst blocks that join. Rejected: approving without words, which lets anyone on the network join; asking only on the approver, which lets a server pull the new device into its own vault; a QR code, which needs a camera; a server-issued code, since the server is untrusted.

### User files are written through their symlinks

Dotfiles managers make `~/.zshrc`, `~/.claude/skills` or `~/Library/LaunchAgents` symlinks into a repo. envden edits the file a link points to and keeps the link, and resolves `ENVDEN_HOME` to its real path at startup so owned-path checks agree. Checkout scans follow symlinked folders once per real path, so `~/Work` on another disk is found and a link back to a parent can't loop. Replaces skipping every symlinked folder and refusing a symlinked `ENVDEN_HOME`. A `.env` that is the user's own symlink is left alone unless the user agrees to a takeover (see below), since syncing through it would overwrite a file another tool owns. Rejected: replacing links with regular files, which silently detaches the dotfiles repo.

### envden can take over env files the user symlinked elsewhere

Replaces skipping a user's `.env` symlink with one stderr line per file. Users share one env file across worktrees by linking each `.env` to something like `~/.config/dev-envs/app/.env`; the scan printed one line per worktree and synced none of them. Now setup and track group these links by target and ask once per target in a terminal, default Yes. On Yes, the target's bytes become the store file for each checkout's repo and path, and each link is replaced by envden's placement. Worktrees of one repo share that store file. The placement adapter replaces a foreign link only when given its exact link text, so a link changed since the scan is refused. Afterwards the checkouts follow envden's synced copy, not the target, and the question says so. The target file is never written, and state keeps the original link text, so `untrack` puts the user's link back (or a plain copy if the target is gone). Only a regular file is offered: a named pipe (1Password's local `.env`) would block the read while holding the state lock. A link to another env file of the same checkout (`.env -> .env.development`) already follows a synced file, so it's left as is and not offered. A missing target or a store file with different bytes leaves the links alone, and one failed takeover is reported without stopping the others. Without a terminal, or on No, nothing changes and the links are counted in the scan summary. Rejected: taking over silently, since the target may belong to a dotfiles repo; copying the target into the checkout as a regular file, which detaches the other checkouts that share it.

### Device keys live in private files; no OS keychain

Replaces keys in the OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager) with a `0600` file fallback and `ENVDEN_KEYCHAIN` to choose. Every envden update is a new binary, so macOS asked "envden wants to use your confidential information" for each key after each upgrade, which looks like malware in a tool that handles `.env` files. The keychain added little: the synced `.env` files are plaintext on disk anyway, and once a user clicks "Always Allow", any process running as that user can run envden to read the keys. Keys are now owner-only files under `ENVDEN_HOME`, the same threat model as `~/.ssh`, and `envden doctor` fails if other users can read them. Rejected: keeping the keychain as an opt-in, which doubled the storage paths to test for a protection the plaintext files already undo.

### Device keys, signed device list, key epochs

Each device has its own keys, membership is a member-signed hash-chained log that takes effect only through the signed manifest swap, removal starts a new epoch instead of re-encrypting, and the recovery code lives only with the user (see [Crypto](#crypto)). Rejected:

- **age for file encryption** (first draft): no associated data, so a malicious server can swap or replay files and they still decrypt, and anyone holding a recipient can create valid files.
- **One shared secret key on every device, Tailscale identity as auth**: Tailscale headers name the user, not the device, are empty for tagged devices, and can be forged by local processes on a laptop-hosted server.
- **Device list served by the server**: the server could add its own key or hand out a fake vault key.
- **Re-encrypting everything on removal**: renames every ID, rewrites append-only history and leaves mixed keys after a crash, and the removed device already saw the old data.
- **Recovery code stored on devices**: every removal would have to replace it, silently invalidating the one the user stored.
- **Pairing link copied between devices**: clumsy to move between machines.
- **Server-issued pairing code** (as T3 Code does): envden's server is untrusted and could swap in its own key.
- **Long typed code (~100 bits) with HMAC**: safe but too long to type; comparing words needs no typing.

Accepted costs:

- The composition around the libraries is envden's own protocol and needs its own review.
- A recovery-joined device detects rollbacks only past the checkpoint sealed in the envelope.
- Devices that held the recovery private key in memory are trusted to have erased it unless the code is replaced when they're removed.
- A server restored from backup is a rollback: restored mode accepts repairs from members holding the repair token until every member repairs or is dropped, and a file whose newest version no device holds can be lost.
- A server alone can show different devices different branches; each stops when it sees the other branch but can't detect one it's never shown. A removed device or old recovery key colluding with the server can fork history, and values a removed device already pulled can't be revoked, so envden lists them for rotation.

### Device names refuse control characters

Replaces a name check that refused only invisible format characters. A newline, tab or escape in `--name` passed that check and then failed when the device record was signed, with a generic "Invalid string". Setup, join, rejoin and rename now refuse any control character up front with the usual device-name message.

### HEAD follows GET

Replaces a 404 for HEAD on every route. Health checks that send HEAD saw a running server as down. The server and the `envden ui` dashboard now answer HEAD on any GET route with the GET status and headers and no body.

### An empty ENVDEN_HOME means the default home

Replaces treating an empty `ENVDEN_HOME` as a path, which put state, keys and the store in whatever folder the command ran from. Empty now means unset, so envden uses `~/.envden`, the same as the install scripts.

### Server switch needs no login

Replaces a switch that asked for the master password and logged in at the destination, because unlock sessions didn't move with the vault. With no unlock left, a member's signature is enough on any server holding the vault, so switch verifies the signed move from its checkpoint and saves the new address.

### Ctrl-D cancels a prompt

Replaces leaving Ctrl-D to readline. On an empty answer it closed the input and the question waited forever, so the user had to kill the process. Ctrl-D now cancels any prompt the same way Ctrl-C and Esc do, with the same message and exit code.

### A stopped server leaves one database file

Replaces leaving SQLite's sidecar files to the platform. On macOS, Apple's SQLite kept `envden.sqlite-wal` and `-shm` after shutdown and Linux removed them, so the data folder differed by OS and a backup taken after a stop on macOS needed three files. The server now turns persistent WAL off and runs a truncating checkpoint when it closes the database.

### Connection timeouts are set, not inherited

Replaces relying on each runtime's default. Bun closed idle connections after about 12 seconds, the Go port after 10 and its dashboard never. `envden serve` and the `envden ui` dashboard now set a 10-second idle timeout, which also covers half-sent headers and a rejected request whose body never arrives. Bun checks timeouts every 4 seconds, so it closes such a connection up to 2 seconds late. Body-read deadlines are unchanged.

### Env-file patterns use a fixed grammar

Replaces accepting any pattern Bun.Glob takes. The Go and Rust ports can't reproduce every corner of Bun's matcher, so the same config could sync different files depending on the build. Patterns are now limited to a grammar all three match the same way: an optional leading `!`, non-empty `/` segments, `**` as a whole segment, printable ASCII literals with `*` and `?` (`?` is one character), and flat `{a,b}` groups, at most 10 groups, 16 alternatives and 1024 characters. Anything else fails with "Unsupported env file pattern" when the config is saved or read, and push and pull check it before writing.

### Keyring writes ignore the storage quota

The quota is checked before a swap writes keyring state, so it limits file content, not keys. Every keyring write is a security operation: removing a device, rotating keys, replacing the recovery code. A full vault must still let a user remove a stolen device. Rejected: counting keyring growth against the quota, which the Rust port review flagged as a bug; it would lock a full vault out of key rotation.

### One-off shares use a temporary public link from the sender

Replaces the plan in issue #9: `send` and `receive` through the server's pairing mailbox, for people on the same tailnet only. The usual case is handing a file to someone with no envden and no access to the tailnet, which a mailbox on a private server can't reach. Making the server public was rejected, since it holds every vault's ciphertext and OPAQUE records. Instead the sender's CLI serves the one encrypted file itself and publishes just that path through Tailscale Funnel while the command runs. The costs: the node's name resolves publicly, and Funnel needs a node attribute. AES-256-GCM is used instead of XChaCha20-Poly1305 because the page decrypts with WebCrypto and loads no library. A Node or Bun one-liner for terminal recipients was rejected because decrypting takes more than one line anyone would audit; the page is the zero-install path.

## Not in v1

Shared or team vaults (one-off shares are under Shares), network adapters other than Tailscale, runtime-loaded plugins, importers, a server-hosted web UI (`envden ui` is local to one device).
