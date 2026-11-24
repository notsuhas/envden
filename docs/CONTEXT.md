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
How a store file appears in a checkout: **link mode** (a symlink into the store, the default) or **copy mode** (a real copy, for places without symlinks: locked-down Windows, containers, sandboxes).
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
One person's encrypted collection of env files. A server can hold many vaults. v1 has no sharing.
_Avoid_: account, workspace, project

**Server**:
The self-hosted service holding the authoritative ciphertext for vaults. Runs on dedicated infra (e.g. a home-lab container) or on one of the user's devices. One server per vault.
_Avoid_: cloud, backend, hub

**Master password**:
The one password the user remembers for a vault. Needed to join without another device, to recover, and when an unlock expires.
_Avoid_: passphrase, PIN

**Secret key**:
A random key generated at vault creation, printed in the recovery kit and never stored on any device. Combined with the master password so a stolen server can't brute-force the password alone.
_Avoid_: recovery key, account key

**Recovery kit**:
The PDF holding the vault ID, secret key and server, meant to be printed or stored offline. With the master password it opens the vault, so the password is never written on it.
_Avoid_: backup codes, emergency sheet

**Unlock**:
A device's permission, granted by entering the master password, to pull and push until its chosen expiry (e.g. 30 days, never). Enforced by an honest server.
_Avoid_: login, session

**Device list**:
The signed, hash-chained record of which devices belong to a vault. Each device verifies its own copy; the server only stores it.
_Avoid_: membership, roster, device registry

**Epoch**:
One generation of the vault's encryption key. Removing a device starts a new epoch for new writes; old data keeps its epoch.
_Avoid_: key version, rotation

**Pairing code**:
A short, one-time, user-typed code (e.g. `3-K7QF-2MXP`: a public mailbox number and a secret part) that an existing device shows so a new device can join.
_Avoid_: pairing link, invite, token

**Join**:
A new device becoming part of a vault, either with a pairing code from an existing device or with the master password and recovery kit.
_Avoid_: login, register, enroll

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
