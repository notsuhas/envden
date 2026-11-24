# envden

Self-hosted sync for whole .env files across a person's devices, over a private network they own, with the server holding only ciphertext.

## Files and repos

**Env file**:
A `.env` or `.env.<name>` file belonging to a repo, synced byte-for-byte as a whole file (comments, order, blank lines). Templates (`.env.example` etc.) and `.envrc` are not env files.
_Avoid_: secret, variable, key

**Template**:
A committed sibling of an env file that lists the keys it should have, named after it with `.example`, `.sample`, `.template` or `.defaults` added. envden compares key names against it and never syncs it.
_Avoid_: example file, sample env

**Repo ID**:
The stable identity of a repo, derived on the device from its remote as `host/path`. All checkouts with the same Repo ID share env files. Never sent to the server.
_Avoid_: project, repo name, path

**Alias**:
A mapping, accepted by the user at the fork prompt, that makes a fork's Repo ID share env files with its upstream.
_Avoid_: link (that's placement), redirect

**Checkout**:
One working tree of a repo on a device: a clone or a worktree.
_Avoid_: repo (that's the Repo ID), workspace, project folder

**Approved checkout**:
A checkout the user has confirmed may receive env files. A registered worktree of an approved clone is approved automatically unless `auto-approve-worktrees` is off.
_Avoid_: trusted folder, enrolled checkout

## Devices and placement

**Device**:
A machine that has joined a vault. Has its own key pair, so it can be added and removed on its own.
_Avoid_: client, node, host

**Store**:
The per-device home folder that holds the real env files for every repo, plus the bases and conflict files.
_Avoid_: cache, local vault

**Placement**:
How a store file appears in a checkout: **link mode** (a symlink into the store, the default) or **copy mode** (a real copy, for places without symlinks: containers, sandboxes).
_Avoid_: materialize, fallback mode

**Base**:
The last version of an env file agreed with the server. Kept per store file in link mode and per copy in copy mode. Used to tell local edits from remote ones and to merge.
_Avoid_: snapshot, cache

**Local only**:
An env file in a checkout deliberately kept different from the store (e.g. a per-worktree `PORT`). Never pushed or pulled.
_Avoid_: override, ignored

**Detached**:
A link-mode checkout whose link was replaced by a regular file with different content. Waits for the user to reconcile; never overwritten silently.
_Avoid_: broken, stale

**Conflict file**:
A file in the store holding both versions of an env file whose keys diverged. Never inside a checkout.
_Avoid_: sidecar, merge file

## Vaults and access

**Vault**:
One person's encrypted collection of env files. A server can hold many vaults. v1 has no vault sharing; a share (below) is separate.
_Avoid_: account, workspace, project

**Server**:
The self-hosted service holding the authoritative ciphertext for vaults. Runs on dedicated infra (e.g. a home-lab container) or on one of the user's devices. One server per vault.
_Avoid_: cloud, backend, hub

**Recovery code**:
A random 128-bit code shown once at vault creation (`ER1-…`), kept by the user in a password manager. The only way back in when every device is lost; a device that's still in the vault can replace it.
_Avoid_: master password, secret key, recovery kit, backup codes

**Device list**:
The signed, hash-chained record of which devices belong to a vault. Each device verifies its own copy; the server only stores it.
_Avoid_: membership, roster, device registry

**Epoch**:
One generation of the vault's encryption key. Removing a device starts a new epoch for new writes; old data keeps its epoch.
_Avoid_: key version, rotation

**Word approval**:
How a device already in the vault lets a new one join: both screens show the same three words, and the user confirms on both.
_Avoid_: pairing code, PIN, invite

**Join request**:
A new device's pending request to join, opened on the server and waiting for a device in the vault to approve it. Expires after 10 minutes.
_Avoid_: mailbox, invite

**Join**:
A new device becoming part of a vault, by word approval from another device or with the recovery code.
_Avoid_: login, register, enroll

**Share**:
One file sent once with `envden send` through a temporary public link that anyone can open, with or without envden or a tailnet. Belongs to no vault; it opens once and closes when the sender's command ends.
_Avoid_: shared vault, team sharing, mailbox, drop

**Export**:
An age-encrypted file of the env files on one device, written by `envden export` so they open with the stock `age` CLI if envden is gone. Holds only what that device has.
_Avoid_: dump, archive, vault backup

## Sync

**Push** / **Pull**:
Explicit, user-triggered transfer of env files from device to server, and from server to device. Never on a timer.
_Avoid_: sync (ambiguous direction), upload, fetch

**Manifest**:
The signed list of every env file's current version in a vault. Swapping it is the only way a push becomes visible.
_Avoid_: index, snapshot, state

**Out of sync**:
A checkout's state when the server has a newer version than its base, or the checkout has unpushed changes.
_Avoid_: stale, dirty

## Extension

**Adapter**:
A swappable implementation of one integration point (network, repo, storage, keychain, placement, shell). Encryption, the sync protocol and merging are never adapters.
_Avoid_: plugin, provider, driver
