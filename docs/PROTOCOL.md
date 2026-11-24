# envden protocol v1

The exact cryptographic protocol behind `DESIGN.md` § Crypto. Code in `packages/core/protocol` follows this document; if they disagree, the code is wrong. Every rule here has a test vector or a test case (§ 14). Revised after three rounds of adversarial review by Codex (GPT-6.1 Sol) and Claude Fable 5.2.

## 1. Primitives

| Use | Primitive | Library |
|---|---|---|
| Hash | SHA-256 | `@noble/hashes` |
| MAC, KDF | HMAC-SHA-256, HKDF-SHA-256 (RFC 5869) | `@noble/hashes` |
| Symmetric encryption | XChaCha20-Poly1305 (draft-irtf-cfrg-xchacha), 24-byte nonce | `@noble/ciphers` |
| Share encryption (§ 16) | AES-256-GCM, 12-byte nonce, 16-byte tag, so a browser can open it with WebCrypto | `@noble/ciphers` to seal and open; WebCrypto on the share page |
| Signatures | Ed25519 (RFC 8032), cofactored verification with canonical encodings (`zip215: false`) | `@noble/curves` |
| Key agreement | X25519 | `@noble/curves` |
| Key wrapping | HPKE base mode (RFC 9180): DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, ChaCha20Poly1305 | `@hpke/core`, with `DhkemX25519HkdfSha256` imported from `@hpke/dhkem-x25519` (not the WebCrypto one in `@hpke/core`) and `Chacha20Poly1305` from `@hpke/chacha20poly1305` |
| Password stretching | Argon2id, m = 65536 KiB, t = 3, p = 4, 32-byte output, `outputType: "binary"` | `hash-wasm` |
| PAKE | OPAQUE (RFC 9807), the library's ristretto255 suite | `@serenity-kit/opaque` (`await ready` before any call) |
| Randomness | `crypto.getRandomValues` | Bun |

- **Pinning.** Every library version is pinned exactly.
- **Test vectors in CI.** CI checks the pinned libraries against known-answer vectors:
  - RFC vectors: HKDF, HMAC, Ed25519, X25519, HPKE.
  - The draft's XChaCha20-Poly1305 vectors.
  - Argon2id: known-answer tests from the reference implementation. hash-wasm has no associated-data input, so the RFC 9106 vectors can't run.
  - A low-order X25519 point fed to HPKE must be rejected.
- **Key validation.** Public keys are checked on receipt:
  - Ed25519 keys must decode canonically and not be of small order.
  - X25519 keys must be canonical: u < 2²⁵⁵ − 19 with the top bit clear.
  - Ed25519 signatures with a noncanonical R or with S ≥ L are rejected.
  - An Ed25519 signature (R, S) on M under A is valid when [8][S]B = [8]R + [8][k]A, with k = SHA-512(R ‖ A ‖ M) mod L. This is the cofactored equation, so an R with a small-order component is accepted; that grants no forgery, because A is canonical and not of small order. Implementations must not use the cofactorless check, or they'd split on which chains are valid.
  - HPKE must reject all-zero X25519 shared secrets.

## 2. Encoding

Every signed, hashed or encrypted structure uses this binary encoding. JSON appears only in HTTP envelopes. Inside them, signed objects travel as base64url of their exact bytes and are never re-encoded.

| Type | Encoding |
|---|---|
| `u8`, `u32`, `u64` | unsigned, big-endian |
| `b16`, `b32`, `b64` | exactly 16, 32 or 64 bytes |
| `bytes` | `u32` length ‖ data, at most 64 KiB |
| `blob` | `u32` length ‖ data, at most 2 MiB |
| `str` | `bytes` holding UTF-8 in NFC, with no Unicode `Cc` (control) characters |
| `list<T>` | `u32` count ‖ items, at most 100,000 items |
| `opt<T>` | `u8 0`, or `u8 1` ‖ T |
| `time` | `u64` milliseconds since the Unix epoch |

Structs are their fields in the listed order and nothing else.

Decoders reject:
- trailing bytes, and lengths past the end or over a limit
- unknown type tags or versions
- `opt` flags other than 0 or 1
- lists that should be sorted but are unsorted or have duplicates
- invalid UTF-8, non-NFC strings and control characters

**Labels.** `ctx(label)` = `str("envden/v1/" ‖ label)`. Every hash, signature, MAC, KDF and AEAD in envden starts with a distinct label, so no output can be reused in another role.

- `H(label, m)` = SHA-256(`ctx(label)` ‖ `u64 len(m)` ‖ m)
- `Sign(sk, label, m)` = Ed25519(sk, `ctx(label)` ‖ `u64 len(m)` ‖ m)
- `MAC(k, label, m)` = HMAC-SHA-256(k, `ctx(label)` ‖ `u64 len(m)` ‖ m)
- `KDF(ikm, salt, label, extra)` = HKDF-SHA-256(ikm, salt, `ctx(label)` ‖ extra, 32 bytes)

**Signed objects** are `body ‖ b64 signature`. The body starts with `u8 type ‖ u8 version`, and every version in v1 is `1`. Vault objects (entry, manifest, repair report) end their body with `signer b16` in every future version too, so a reader can check the signature of a version it can't parse (§ 10 Unknown data). The signature is `Sign(sk, type label, body)`. The object's hash is `H("hash/" ‖ type label, body ‖ signature)`.

| Tag | Type label | Protection |
|---|---|---|
| `0x01` | `entry` | signed by a member's object key |
| `0x02` | `manifest` | signed by a device's object key |
| `0x03` | `files` | hashed into a manifest |
| `0x04` | `keyring` | encrypted |
| `0x05` | `envelope` | encrypted |
| `0x06` | `file` | encrypted |
| `0x07` | `pair-joiner` | encrypted in the pairing channel |
| `0x08` | `pair-approver` | encrypted in the pairing channel |
| `0x09` | `request` | signed by a device's request key |
| `0x0A` | `server-hello` | signed by the server key |
| `0x0B` | `repair-report` | signed by a device's object key |
| `0x0D` | `file-name` | encrypted |

**Text forms.** `b32(x)` is Crockford base32, uppercase, with no padding. Decoders uppercase their input and reject non-zero trailing bits. Integers inside text (mailbox numbers) are decimal with no leading zeros.

**Passwords.** `normPw(p)` = NFKC(p) as a JS string, with no trimming. It's rejected if empty. OPAQUE takes that string; Argon2id takes `utf8(normPw(p))`.

## 3. Keys and identifiers

| Key | Type | Created | Held by |
|---|---|---|---|
| Device encryption key | X25519 | device setup | that device's key files |
| Device object key | Ed25519 | device setup | that device's key files |
| Device request key | Ed25519 | device setup | that device's key files; separate so a request signature never counts as a vault object |
| Recovery encryption key | X25519 | vault creation, kit replacement, password reset | the password envelope; held in memory only while creating, joining with the kit, replacing the kit, or changing or resetting the password |
| Recovery object key | Ed25519 | same | same |
| Epoch key `K_e` | 32 random bytes | each new epoch | HPKE-wrapped to members; older ones in the keyring |
| ID key `K_id` | 32 random bytes | vault creation, never rotated | the keyring |
| Secret key `SK` | 16 random bytes | vault creation, kit replacement | recovery kit only |
| SK key | Ed25519 from `KDF(SK, vaultId, "sk-sign", empty)` | with `SK` | derived when needed; the server stores only `skPub` |
| Server signing key | Ed25519 | first server start | server data folder |
| Server OPAQUE setup | `server.createSetup()` | first server start | server data folder |

- **Device ID** = first 16 bytes of `H("device-id", encPub ‖ objPub ‖ reqPub)`.
- **Recovery ID** = first 16 bytes of `H("recovery-id", encPub ‖ objPub)`.
- **Member ID**: a device ID or the current recovery ID.
- **Server pin** = `H("server-pin", serverSignPub)`. Devices store the server's address separately; the address isn't part of the pin.
- **Vault ID** = hash of the signed genesis entry (§ 5).
- **File ID** = `MAC(K_id, "file-id", str(repoId) ‖ str(path))`. `path` is relative to the repo root, `/`-separated, NFC, with case preserved. It must be nonempty and contain no `\`, `:`, empty, `.` or `..` segments, or segments ending in a dot or space. Segments must not match the Windows device names `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9` or `LPT1`–`LPT9`, including superscript `¹`, `²`, `³` suffixes, case-insensitively, with or without a dot extension.

```
DeviceRecord   { id b16, name str (1–64 bytes, no Unicode Cc or Cf characters), encPub b32, objPub b32, reqPub b32 }
RecoveryRecord { id b16, encPub b32, objPub b32 }
```

Receivers recompute every ID from the public keys and reject mismatches. Device and recovery encryption public keys must be canonical (little-endian u < 2²⁵⁵ − 19, so the top bit is clear) and permit X25519 key agreement with a nonzero shared secret; receivers reject noncanonical and low-order keys when validating records. Device names exclude format characters (zero-width, bidi controls) so two names that look the same are the same, and control characters like any `str`.

## 4. Wraps and epochs

```
Wrap        { recipient b16, enc b32, ct bytes }     // HPKE encapsulated key, sealed K_e
EpochChange { epoch u32, keyCommit b32, wraps list<Wrap> sorted by recipient }
```

- `ct` = HPKE.Seal(recipient encPub, info, aad = empty, pt = `K_e`), with info = `ctx("wrap")` ‖ vaultId ‖ `u32 epoch` ‖ recipient ID ‖ recipient encPub.
- `keyCommit` = `MAC(K_e, "epoch-commit", vaultId ‖ u32 epoch)`. A recipient unwraps, recomputes the commit and rejects a mismatch. Keys from the keyring are checked against their epochs' commits the same way.

**Keyring.** One blob per epoch, encrypted under that epoch's key.

```
Keyring (0x04) { type, version, vaultId b32, epoch u32, idKey b32, older list<{ epoch u32, key b32 }> }
```

- `older` holds every epoch from 1 to `epoch − 1`, ascending, with no gaps.
- Key = `KDF(K_e, vaultId, "keyring-key", u32 epoch)`. AD = `ctx("keyring")` ‖ vaultId ‖ `u32 epoch`.
- Blob = `u8 1` ‖ random nonce(24) ‖ ciphertext. `keyringHash` = `H("keyring-blob", blob)`.
- After decrypting, a device that already knows `K_id` checks that `idKey` matches it.

## 5. Device list

```
Entry (0x01) {
  type u8, version u8,
  vaultId b32,        // all zeros in genesis
  seq u64,            // genesis = 0
  parent b32,         // hash of the previous entry; zeros in genesis
  kind u8, payload,
  signer b16          // member ID
}
```

| Kind | Payload | Signer |
|---|---|---|
| `0` genesis | `serverPin b32, device DeviceRecord, recovery RecoveryRecord, vaultNonce b32, createdAt time` | the first device |
| `1` add-device | `device DeviceRecord, wrap Wrap` | a device (pairing) or the recovery key (kit join) |
| `2` remove-device | `device b16, newRecovery opt<RecoveryRecord>, change EpochChange` | a device other than the one removed |
| `3` new-epoch | `change EpochChange` | a device |
| `4` replace-recovery | `recovery RecoveryRecord, change EpochChange` | a device |
| `5` server-moved | `oldPin b32, newPin b32, newAddress str` | a device |
| `6` repair-done | `repairId b32, restoredHead b32` | a device |
| `7` rename-device | `device b16, name str` | the device renamed |

**Vault ID** = `hash(genesis)`. `vaultNonce` is random, so two vaults never share an ID. Genesis has no epoch. Entry `seq 1` must be a new-epoch for epoch 1, signed by the genesis device. Both are created and stored locally before anything is uploaded.

**State.** Applying entries in order gives `{ vaultId, seq, head, devices, recovery, epoch, serverPin, everUsedIds, repairIds }`. The members are the devices plus the recovery record.

Entry `e` is valid against state `S` only if:

1. `e.vaultId = S.vaultId`, `e.seq = S.seq + 1`, and `e.parent = S.head`.
2. `e.signer` is a member of `S`, and the signature verifies under that member's object key. The recovery key may sign only add-device.
3. Per kind:
   - **add-device**:
     - the device ID isn't in `everUsedIds`
     - the name is unique among devices
     - `wrap.recipient` is the new device
     - the vault has at most 64 devices
     - `S.epoch ≥ 1`
   - **remove-device**: the device is a member, it isn't the signer, and it isn't the last device. If `newRecovery` is present, it replaces the recovery record, and its ID isn't in `everUsedIds`.
   - **replace-recovery**: the new recovery ID isn't in `everUsedIds`.
   - **new-epoch, remove-device, replace-recovery**:
     - `change.epoch = S.epoch + 1`
     - the wrap recipients are exactly the members after the entry
   - **server-moved**: `oldPin = S.serverPin`. Applying it sets `S.serverPin = newPin`.
   - **repair-done**: `repairId` isn't in `S.repairIds`. Applying it adds `repairId` to `S.repairIds`.
   - **rename-device**: the device is a member and is the signer. The name follows the `DeviceRecord` rules and is unique among devices, so it can't be the device's current name. Applying it changes only that device's name; the ID doesn't cover the name, and keys and epoch are unchanged.

A recovery-signed add-device is a kit join. A device-signed one is a pairing. There's no separate field for this, so the signer can't lie about which it was.

## 6. Manifests

```
ManifestHeader (0x02) {
  type, version, vaultId b32,
  seq u64,                  // first = 1
  op u8,                    // the swap operation (table below); 0 for manifest 1
  prev b32,                 // zeros when seq = 1
  listSeq u64, listHead b32,
  epoch u32, keyringHash b32, filesHash b32,
  envelopeHash b32,         // H("envelope-blob", current envelope blob)
  createdAt time,           // informational only
  signer b16                // a device at listHead
}
Files (0x03) { type, version, entries list<FileEntry> sorted by fileId }
FileEntry { fileId b32, version u64, epoch u32, state u8, blobHash b32, name bytes }
FileName (0x0D) { type, version, repoId str, path str }
```

- `filesHash` = `H("files", Files)`.
- **States**: 1 live, 2 deleted, 3 recovered (live, restored from an older version by a repair), 4 lost (deleted by a repair). States 3 and 4 appear only in a repair-fix swap.
- **Deleting** a file writes a new version with state 2 and `blobHash` = zeros. **Restoring** it writes a new live version. Decoders reject a live entry (state 1 or 3) whose `blobHash` is zeros, and a tombstone (state 2 or 4) whose `blobHash` isn't.
- **`name`** is the file's `FileName`, padded and encrypted like a file blob (§ 7) with key `KDF(K_e, vaultId, "file-name-key", fileId)` and AD `ctx("file-name")` ‖ vaultId ‖ `u32 epoch` ‖ fileId ‖ `u64 version`, using the entry's epoch. Every changed entry gets a fresh `name`. A reader decrypts it and recomputes `fileId` from it. This is how a device learns which file IDs belong to its repos without fetching their blobs.
- File IDs are never dropped from the list, so tombstones outlive history pruning.
- **Who held the recovery key.** The signer of any header that changes `envelopeHash`, plus every kit-joined device, held the recovery private key in memory. Devices compute this set from history.

**Swap.** A swap is one compare-and-swap, the only way anything becomes visible:

```
Swap {
  expectedHead b32,
  entries list<Entry>, header ManifestHeader, files opt<Files>,
  keyring opt<blob>, envelope opt<blob>, skPub opt<b32>, opaqueRecord opt<bytes>,
  approver opt<bytes>       // op 2 only: the encrypted PairApprover (§ 12)
}
```

Each swap is exactly one operation, named by `header.op`, so every reader knows which row a header claims. The server rejects any other combination of entries and fields. `files` is present exactly when the files change.

| `op` | New entries | Files change | Keyring | Envelope | `skPub` | `opaqueRecord` | Authorization (§ 11) |
|---|---|---|---|---|---|---|---|
| 1 push | none | yes | — | — | — | — | unlocked |
| 2 pair | one device-signed add-device | no | — | — | — | — | that mailbox's grant |
| 3 kit join | one recovery-signed add-device for the ticket's device | no | — | — | — | — | join ticket |
| 4 remove | one remove-device without `newRecovery` | no | yes | — | — | — | fresh; or the repair token in restored mode (§ 13) |
| 5 remove + new kit | one remove-device with `newRecovery` | no | yes | yes | yes | — | fresh |
| 6 rotate | one new-epoch | no | yes | — | — | — | fresh |
| 7 replace kit | one replace-recovery | no | yes | yes | yes | — | fresh |
| 8 change password | none | no | — | yes | — | yes | fresh |
| 9 reset password | one replace-recovery | no | yes | yes | — | yes | `SK` proof |
| 10 server moved | one server-moved | no | — | — | — | — | O: the move session; N: it extends N's imported head with N's pin (§ 13) |
| 11 repair fix | none | only to states 3 and 4, and only for live entries whose blob the server lacks | — | — | — | — | repair token, restored mode only (§ 13) |
| 12 repair done | one repair-done | no | — | — | — | when re-registering | repair token, restored mode only, committed together with the finishing login (§ 13) |
| 13 rename | one rename-device signed by `header.signer` | no | — | — | — | — | unlocked |

- **Unchanged parts.** Apart from what the operation changes, the header's `epoch`, `keyringHash` and `envelopeHash` are unchanged. "Files change: no" means `filesHash` is unchanged.
- **Commit.** The server checks all of these, then commits everything in one database transaction:
  - its head is `expectedHead`
  - the operation's shape and authorization hold
  - the request is signed by `header.signer`, except op 10 on N, where any member at `header.listHead` may forward the unchanged swap that O committed
  - every blob the swap newly references was uploaded
  - the entries and the header pass §§ 5–6 (defence in depth)
  - `envelopeHash` matches the new envelope
- **Entries.** Entries never named by a stored manifest don't exist.
- **Retries.** The server stores `H("swap", request body)` for every committed swap. A retry whose digest matches any committed swap returns success. A different body naming an already-committed header is rejected. A restore can roll the digest table back, so a client that finds its own header already in the chain also treats that as success.

**Accepting a manifest.** A device holds a checkpoint `C`: its last accepted header and that header's file list. It keeps every header it has accepted. It receives head `M`.

1. **Order.**
   - If `M.seq ≤ C.seq` and `M` equals the stored header at `M.seq`, it's a rollback (or no change, when equal to `C`).
   - If `M.seq ≤ C.seq` and `M` differs from the stored header at `M.seq`, it's a fork.
   - Both cases stop (see Rollback and fork below).
2. **Each header** `h`, in order from `C.seq + 1` to `M.seq`:
   - **Signature and linkage.**
     - The signature verifies under the signer's object key, taken from the device-list state at `h.listHead`.
     - The signer is a device in that state.
     - `h.vaultId` is the vault, `h.seq = prev.seq + 1`, and `h.prev = hash(prev)`, where `prev` is `C` for the first header.
   - **Device list.** The entries from `prev.listHead` to `h.listHead` are a valid extension (§ 5), and `h.listSeq ≥ prev.listSeq`.
   - **Operation.** The new entries and the changed fields (`epoch`, `keyringHash`, `envelopeHash`, `filesHash`) fit the row named by `h.op`.
   - **Epoch.** `h.epoch` equals the list's epoch at `h.listHead`.
   - **Repair done.** For op 12, the repair-done's `restoredHead` is a header before `h`.
3. **Files**, comparing `C` with `M`:
   - `H("files", files) = M.filesHash`.
   - Every file ID in `C` appears in `M`.
   - Each entry is either identical to `C`'s, or has a greater version and `C.epoch ≤ epoch ≤ M.epoch`. New file IDs have `version ≥ 1` and `C.epoch ≤ epoch ≤ M.epoch`.
   - In a push or repair fix, the changed entries must have `epoch = h.epoch`. The server checks this, and so does any device that has both adjacent file lists.
   - **Repair fixes.** For every op-11 header between `C` and `M`, the device fetches that header's file list and the one before it (servers and devices keep both forever, and the device stops if one is missing), and checks them against their `filesHash`. For each file that op 11 changed, found by comparing the two, it reports the change ("restored *path* to the version from *date*" or "*path* was lost"). If it holds local content for that file, it never fast-forwards that file, even if later versions followed; it treats it as a conflict.
4. **Keyring**, if the epoch changed: it decrypts, its hash matches, every key matches its epoch's commit, and `idKey` is unchanged.
5. `C := M`.

**Repair material.** A device keeps every header and entry from seq 1 to its checkpoint, the latest keyring, its checkpoint's file list, the envelope blob if it has the one its checkpoint names, every op-11 file list it has fetched or written, with the list before it, and the ciphertext of every live file in `C` from repos it has approved. A joining device fetches the headers and entries before its checkpoint once, checking them by hash chain back from the checkpoint. It doesn't fetch other repos' file blobs; it learns which file IDs are its own from `name`. Servers keep every manifest header and entry forever. Bodies and blobs follow the history policy in `DESIGN.md`.

**Rollback and fork.**
- **Rollback**: the server's head is an ancestor of the device's checkpoint. This normally means the server was restored from a backup. envden stops and points to `envden server repair` (§ 13).
- **Fork**: the two heads don't descend from each other. Causes:
  - a bug
  - the documented collusion case: a removed device or an old recovery key working with the server
  - a malicious server acknowledging two different swaps on the same head and showing each to different devices, which keeps them apart. Each device detects the fork as soon as it sees the other branch.

  envden stops, shows both sides and offers no override. The documented fix is to create a new vault from a trusted device's store.
- **No longer a member**: the server rejects the device as a non-member. The device can't read the chain, so it says only that the server reports it removed, and that `envden join` will check why. The join grants reads, and the device classifies the chain against its stored headers before it adopts anything: before the kit-join swap, or, when pairing, at § 12 step 13 before taking the checkpoint. A pairing that aborts there leaves an orphan (§ 12).
  - **Removed**: the chain descends from its checkpoint and contains a remove-device for it. envden names who removed it and when.
  - **Dropped by a repair**: the chain leaves its stored headers at some point, after that point it contains a repair-done entry whose `restoredHead` is a header before that point, and the device's old ID is not a member at the new head. Either the new chain removes it after the split, or its own add-device lies in its stored headers after the split. This happens after `--without`, or to a device added after the backup that didn't repair.
    - A repair-done is just a signed entry, so it proves no restore. A former member is a device or recovery record that its stored chain removed or replaced by its checkpoint. If one is a member at the new head, or signed any header or entry after the split, the chain is a fork. That includes an honest repair that kept a device removed after the backup, so such a repair also drops that device with `--without`.
  - **Anything else** is a rollback or fork, and the join aborts.

  A rejoin keeps the device's stored headers up to that point as its floor. It keeps the local store and applies the first-run choice to every file, so nothing is overwritten silently.

## 7. Files

```
File (0x06) { type, version, repoId str, path str, content blob (≤ 1 MiB) }
```

- `K_f` = `KDF(K_e, vaultId, "file-key", fileId)`, using the key of the epoch the version is written in.
- **Padding.** Plaintext = `File` ‖ zero bytes, up to the next multiple of 256 bytes (no padding if it's already a multiple). Decoders parse `File`, then require fewer than 256 remaining bytes, all zero.
- AD = `ctx("file")` ‖ vaultId ‖ `u32 epoch` ‖ fileId ‖ `u64 version`.
- Blob = `u8 1` ‖ random nonce(24) ‖ ciphertext. `blobHash` = `H("blob", blob)`. Blobs are content-addressed, and the server rejects uploads whose hash doesn't match.
- **Reading a file.**
  1. Check the blob hash against the accepted manifest entry.
  2. Decrypt.
  3. Recompute `fileId` from `repoId`, `path` and `K_id`, and reject a mismatch.

  The repo ID and path inside the file must also equal the entry's decrypted `name`.

## 8. Password envelope and secret key

```
pwKey  = Argon2id(utf8(normPw(password)), salt, m=65536, t=3, p=4, len=32)
envKey = KDF(pwKey ‖ SK, vaultId, "envelope-key", empty)
Envelope (0x05) { type, version, vaultId b32, recoveryEncSk b32, recoveryObjSk b32, checkpoint b32, sealedAt time }
blob = u8 1 ‖ salt(16) ‖ nonce(24) ‖ XChaCha20-Poly1305(envKey, nonce, Envelope, AD = ctx("envelope") ‖ vaultId)
envelopeHash = H("envelope-blob", blob)
skPub = public key of Ed25519 seed KDF(SK, vaultId, "sk-sign", empty)
```

- **Salt.** The salt is fresh every time the envelope is sealed.
- **Checkpoint.** `checkpoint` is the `expectedHead` of the swap that installs the envelope: the header it builds on, or zeros at vault creation. The swap's own header names the envelope by `envelopeHash`. That's how a kit-recovered device finds and verifies the envelope, and it avoids a circular hash.
- **When it's sealed**: only in the swap operations that carry an envelope (§ 6): creation, remove + new kit, replace kit, change password and reset password. Devices never hold `SK`, so they can't reseal it at any other time. The checkpoint is therefore the rollback floor for a kit-recovered device (DESIGN § Decisions).
- **`skPub`.** The server stores only the public key, so nothing it holds, including backups, can produce an `SK` proof (§ 10). It's installed at creation and with a new kit, and a server move copies it.
- **Secret key text**: `EK1-` ‖ `b32(SK ‖ first 2 bytes of H("sk-check", SK))`, in groups of five. The checksum catches typos before anything is sent.
- **Recovery kit** prints:
  - the secret key
  - the vault ID (`b32`)
  - the server address at print time, as a hint only (§ 13, Join with the kit)
  - a blank line for the master password

## 9. OPAQUE

**Constants.** `KS = { "argon2id-custom": { memory: 65536, iterations: 3, parallelism: 4 } }`. This equals the library's current default. It's passed explicitly so a change to the default can't silently break logins.

**Call map** for `@serenity-kit/opaque` 1.1.0. Only these calls are used, with exactly these parameters:

| Step | Call |
|---|---|
| Register, client | `client.startRegistration({ password })`, then `client.finishRegistration({ password, registrationResponse, clientRegistrationState, identifiers, keyStretching: KS })` |
| Register, server | `server.createRegistrationResponse({ serverSetup, userIdentifier, registrationRequest })` |
| Log in, client | `client.startLogin({ password })`, then `client.finishLogin({ clientLoginState, loginResponse, password, identifiers, keyStretching: KS })`. This returns `undefined` on a wrong password. |
| Log in, server | `server.startLogin({ serverSetup, registrationRecord, startLoginRequest, userIdentifier, identifiers })`, then `server.finishLogin({ serverLoginState, finishLoginRequest, identifiers })` |

**Identifiers and passwords.** These are JS strings, passed as-is.

| Use | `userIdentifier` (credential ID) | `identifiers.client` | `identifiers.server` | `password` |
|---|---|---|---|---|
| Unlock and kit join | `b32(vaultId)` | `envden/v1/unlock/` ‖ `b32(vaultId)` | `envden/v1/unlock-server` | `normPw(master password)` |
| Pairing | `envden/v1/pair` | `envden/v1/pair/joiner` | `envden/v1/pair/` ‖ `b32(serverPin)` ‖ `/` ‖ mailbox | the 8 normalized code characters |

**Rules:**
- **Message encoding.** Registration and login messages, records, states and session keys are base64url strings. The protocol uses their decoded bytes. Every message has the fixed length of the library's RFC 9807 ristretto255 configuration. These lengths are written into the code and checked by vectors.
- **Shape checks.** Servers and devices check each message's length and encoding before every library call. A malformed input can leak WASM memory until a fixed library release is pinned.
- **Server login state** is kept server-side, keyed by (vault, device ID, purpose). It expires in 2 minutes and is consumed once. It's never accepted from a client. `KE1` and `KE3` must come from the same device ID.
- **Registration start** is authorized, and counted against the rate limiter, by exactly one of:
  - a setup-token proof, only for a vault ID the server doesn't have: creation, or the move session's import
  - a fresh login: change password
  - an `SK` proof: reset password
  - a repair-token proof: re-registration at the end of a repair (§ 13)
- **Server move.** A new server has a different OPAQUE setup, so a move always re-registers.
- **Vectors.** The library takes no injected randomness. Its test vectors therefore store the client and server states with `KE1`/`KE2`, and test the two finish calls.

## 10. Server identity, requests and proofs

**Hello.** Before anything else, the client sends a random 32-byte challenge. The server returns a signed hello:

```
ServerHello (0x0A) { type, version, challenge b32, host str, serverSignPub b32, appVersion str, minClient str, protocols list<u8> }
```

- `host` is the lowercased hostname the client dialled.
- The client checks the signature, that `challenge` and `host` are its own, and that `H("server-pin", serverSignPub)` is the pin it expects.
- The pin catches talking to the wrong server. Confidentiality in transit relies on TLS from `tailscale serve`, which is why secrets never travel as bearer values.

**Requests.** Every request carries the headers `Envden-Device`, `Envden-Time`, `Envden-Nonce` (16 bytes), `Envden-Body-Hash` (SHA-256 of the body), `Envden-Signature` and, when needed, `Envden-Proof`. Binary header values are base64url. The signature is `Sign(reqSk, "request", R)` over:

```
Request (0x09) { type, version, serverPin b32, vaultId b32 (zeros if none), method str, pathAndQuery str, bodyHash b32 = SHA-256(body), time time, nonce b16, device b16, clientVersion str }
```

The server rejects a request if:
- the signature doesn't verify
- `R.serverPin` isn't its own pin
- the vault is unknown, except on creation and import
- `|time − now|` is 300 seconds or more
- `(device, nonce)` was seen in the last 10 minutes. A nonce is kept for exactly 10 minutes, so it outlives every time its request could be accepted.
- the device isn't a member at the server's current device-list head, except on the non-member endpoints below

**Non-member endpoints.** These requests are signed with the new device's request key and carry its `DeviceRecord`.

| Endpoint | Allowed with |
|---|---|
| Vault creation and its registration | a setup-token proof |
| Move import and its registration | the move session (§ 13) |
| Kit login | rate limit only. If it fails, the error adds that the vault may have moved, so the user can try the current server's address. |
| Read the device list, the manifest headers, the head file list, keyrings and the envelope | the join ticket, until it's used |
| Kit-join swap | the join ticket |
| Joiner side of a pairing mailbox | the mailbox number |
| Fetch its `PairApprover` | the joiner's device ID, within 24 hours (§ 12) |

**Proofs** go in `Envden-Proof`:
- **Setup token**: `MAC(H("setup-token", secret), "token-proof", R)`.
- **Repair token**: `MAC(H("repair-token", secret), "repair-proof", R)`.
- **Secret key**: `Sign(skSk, "sk-proof", R)`, verified under `skPub`. After a restore, the server may refuse `SK` proofs until the kit is replaced (§ 13).

The server stores `H("setup-token", secret)`, `H("repair-token", secret)` and `skPub`. Token proofs are recomputed and compared in constant time.

**Versions.** `appVersion`, `minClient` and `clientVersion` are `X.Y.Z`, digits only, with no leading zeros except the single digit `0`. `protocols` lists the protocol versions the server speaks, sorted; v1 is `[1]`.
- The server rejects a request whose `clientVersion` is below `minClient` with `426`. The 426 body is unsigned, so the client runs hello again and trusts only the signed `minClient`. If that's above the latest GitHub release (§ 15), it reports "the server requires a version that doesn't exist" instead of "update envden".
- The server records each device's last `clientVersion`.
- The client refuses a server whose `appVersion` is below the client's built-in `minServer`.
- **Protocol version.** The client uses the highest version both sides speak, and stores the highest it has used per vault. It never goes below that.
- Version checks aren't a security boundary. A client that lies about its version only hurts its own user.
- **New formats.** Each new entry kind, op, or type version names the release that first reads it.
  - Signed types: the server accepts one only if `minClient` is at least that release.
  - Encrypted types (keyring, envelope, file, file name, pairing messages): the server can't see them, so the writer checks the signed hello's `minClient` before writing one.
  - A server that receives a format it doesn't know, including in a repair upload, answers "update the server".
- **Unknown data.** A client classifies data from the server in this order:
  1. Compare headers and entries byte for byte with the ones it stored. A mismatch is a rollback or fork (§ 6), whatever the version.
  2. Verify the signature, using the `signer` at the end of the body and the member's key from the verified state. Decrypt encrypted types.
  3. Only data that passes step 2 and has an unknown tag, version, kind or op gets "update required". Anything else is "invalid data from server".
  4. If the client is already at the latest GitHub release, it says "unreadable data from server" instead of "update required".

**Setup token.**
- Text: `b32(0x01 ‖ secret(20) ‖ serverPin(32))`, one unbroken word so a double-click selects all of it. The first byte is the token kind and version: `0x01` setup, `0x02` repair. Decoding ignores whitespace and case.
- The device decodes the pin and runs hello against it before sending any proof.
- One token is active at a time, and starting `envden serve` with `ENVDEN_SETUP_TOKEN` set replaces it. It's valid only for creating or importing a vault ID the server doesn't have.
- It's consumed when that vault is committed. A retried creation or import with the same body digest returns success.

## 11. Unlock, fresh login and limits

The server stores the unlock period per vault (1d, 7d, 30d or never; default 30d), and `unlockedUntil` and `freshUntil` per device.

- **Login.** A successful OPAQUE login sets `unlockedUntil = now + period` and `freshUntil = now + 10 min`.
- **Reading the window.** An unlocked member reads its own `unlockedUntil` (null when the period is never) and `freshUntil` from `GET /v1/unlock-window`. Devices record it after setup and every join.
- **Unlocked.** Pull, push and blob endpoints, and the rename swap, require `now < unlockedUntil`, unless the period is never. A name is only a label, so renaming needs no fresh login.
- **Fresh login** (`now < freshUntil`) is required for:
  - opening a pairing mailbox
  - the remove, rotate, replace-kit and change-password swaps
  - starting a server move, and freezing or unfreezing a server
  - changing the unlock period
  - reading the envelope as a member
- **Mailbox grant.** Opening a mailbox doesn't extend `freshUntil`. The open mailbox authorizes exactly one pair swap from the device that opened it. That grant lasts until the mailbox's 10-minute exchange window ends. When the swap commits, the new device gets the approver's `unlockedUntil` and no fresh window.
- **Kit join.** A successful kit login gives the candidate device a join ticket: server-side state keyed by (vault, candidate device ID), not a bearer value. The ticket is bound to (vault, candidate device ID), lasts 10 minutes and is used once. It allows the reads listed in § 10 and exactly one kit-join swap, signed by that candidate. After the swap, the device is unlocked for one period, with no fresh window.
- **SK proof.** An `SK` proof authorizes exactly one reset-password swap. It also authorizes the reads needed to build it, even if the device is locked: the headers and entries from the device's checkpoint to the head, the head's file list, the keyring and the envelope. It bypasses `unlockedUntil` and `freshUntil` for those requests only.
- **Rate limits.**
  - Every OPAQUE login start counts as a failure, and a successful finish refunds it. That's because each `KE2` allows one offline guess, with or without `KE3`. Registration starts count the same way, with a refund only when the registration record is committed by creation, move activation or a swap.
  - Members have one bucket per device ID. Non-members (kit login) have one bucket per vault.
  - Each bucket allows 5 failures per 15 minutes, then a doubling lockout up to 24 hours. A stolen device can lock only itself out, and strangers can lock only the kit path.
  - Pairing mailboxes have their own limits (§ 12).

These rules hold only against an honest server (DESIGN § Unlock and expiry).

## 12. Pairing

**Code.** The code is `m-XXXX-XXXX`.
- `m` is the mailbox number: the smallest free integer from 1 to 999 among the server's open mailboxes.
- `XXXX-XXXX` is 8 random Crockford base32 characters, which is 40 bits.
- Input is normalized: uppercased, dashes and spaces removed, `O` read as `0`, and `I`/`L` read as `1`. If a separator follows the mailbox group, that group fixes the mailbox boundary and exactly 8 code characters must follow after normalization. For compact input, the last 8 characters are the secret. In either form the remaining mailbox must be 1–999 with no leading zeros; all secret characters must be Crockford base32. Other input is rejected.

**Flow.** A is the approving device, B is the joiner, S is the server.

1. **A** needs a fresh login. It opens a mailbox at S and gets `m`.
2. **A** registers the code entirely locally:
   - a throwaway `server.createSetup()`
   - client start, server response and client finish, using the pairing identifiers

   A keeps only the throwaway setup and the record, and shows the code.
3. **B** runs `envden join <server>`:
   - does hello and remembers that pin
   - generates its device keys and stores them in its key files
   - asks for the code
   - posts `KE1` to mailbox `m`
4. **S** stores `KE1` in the mailbox's `KE1` slot (see Server rules).
5. **A** fetches `KE1`, marks the code used before doing anything else, and posts `KE2`.
6. **B** runs `client.finishLogin`. If it returns `undefined`, the code was wrong: B stops and tells the user to make a new code. Otherwise B posts `KE3`.
7. **A** runs `server.finishLogin`. On failure, A closes the mailbox. On success, A erases the code, its throwaway setup and the record.
8. **Channel keys.**
   - `k_BA = KDF(sessionKey, empty, "pair/joiner-to-approver", empty)`
   - `k_AB` is the same with label `pair/approver-to-joiner`
   - Each side stores the keys it needs in its key files until pairing ends, then erases them along with `sessionKey`.
9. **Messages.** Each message is `u8 1 ‖ random nonce(24) ‖ XChaCha20-Poly1305(key, nonce, plaintext, AD = empty)`. Each is encrypted once, stored, and resent byte-for-byte on retry of the same attempt. If A's pair swap loses the compare-and-swap, A rebuilds the add-device entry (with a new wrap if the epoch moved), the header and the `PairApprover`, with a fresh nonce.
10. **B → A**: `PairJoiner (0x07) { type, version, device DeviceRecord }`. A recomputes the ID and checks that the keys are unused. If the name is taken, A appends `-2`, `-3`, … to the first free one, shortening the name to stay within 64 bytes. The ID doesn't cover the name, so the record stays valid.
11. **A** asks "Add *name*? [y/N]" with that name. On yes, before the exchange window ends, A makes the pair swap. On a rebuild after a lost compare-and-swap, A picks the name again and re-checks the 64-device limit. It carries a device-signed add-device with B's wrap of the current epoch key.
12. **A → B**: `PairApprover (0x08) { type, version, vaultId b32, serverPin b32, manifestHash b32 }`, naming the manifest that committed B. A can't know that hash before signing, so `manifestHash` is the hash of the swap's own header, which A computes before submitting. The encrypted message rides in the swap's `approver` field, so S stores it atomically with the commit, keyed by B's device ID, for 24 hours. A stores its swap and resubmits it unchanged if interrupted.
13. **B** fetches it by its device ID, with `envden join --resume` if it was interrupted. Since B is now a member, ordinary signed requests work. B checks, in order:
    1. `serverPin` equals the pin from its hello, else it aborts.
    2. It fetches the device list. `hash(genesis) = vaultId`, and the list is valid up to the header's `listHead` (§ 5).
    3. It fetches the header for `manifestHash` and verifies its signature against that state. B's add-device is in the list.
    4. It checks its wrap, the key commit and the keyring.
    5. It fetches that header's file list and checks it against `filesHash`, then fetches the earlier headers and entries (§ 6 Repair material).
    6. If B is rejoining, it classifies the chain (§ 6 No longer a member) and aborts on a rollback or fork.

    That header becomes B's checkpoint, and B takes its name from its committed add-device. B never treats itself as a member without a valid `PairApprover`.

**Server rules.**
- Mailbox messages are at most 4 KiB.
- A mailbox has four slots, each written once: `KE1` and `KE3` from B, `KE2` from A, then `PairJoiner` from B, accepted only after `KE3`. An identical resubmission returns success. A different message for a filled slot closes the mailbox.
- Slots are writable only within 10 minutes of opening. The mailbox, and its number, are freed when the pair swap commits, or at the 10-minute mark if none did. `PairApprover` lives on separately, keyed by device ID.
- A vault can open at most 10 mailboxes per hour. Non-member mailbox writes are limited to 20 per 15 minutes per source device ID and per mailbox number, with a doubling lockout up to 24 hours.

**Orphans.** If A commits but B never receives `PairApprover` in time, B shows up in `envden device list` as never confirmed. The user removes it with `envden device rm` and pairs again with fresh keys.

**What a bad server gets.** It can relay or block messages. It gets one online guess against A's code by posing as B, and one against B's input by posing as A. Each guess succeeds with probability 2⁻⁴⁰, and nothing it sees can be checked offline.

## 13. Flows

**Create a vault** (first device D):
1. Hello against the setup token's pin.
2. Generate D's keys, the recovery keys, `SK`, `K_id`, `K_1` and `vaultNonce`.
3. Sign genesis and entry 1: new-epoch for epoch 1, wrapped to D and to recovery. Build keyring 1. Store all of it locally.
4. Register OPAQUE with a token proof.
5. Seal the envelope with `checkpoint` = zeros, and compute `skPub`.
6. Build manifest 1 (no files, `envelopeHash` set) and store it.
7. Send one creation request with a token proof: genesis, entry 1, manifest 1, keyring, envelope, `skPub` and `opaqueRecord`.
8. Print the recovery kit.

**Join with the kit** (new device B):
1. The user gives the server address; the kit's address is only a hint. B does hello and remembers the presented pin.
2. B logs in with OPAQUE as a non-member, with `userIdentifier = b32(vaultId)` and the vault ID from the kit. Success returns a join ticket.
3. B reads the device list. `hash(genesis)` must equal the kit's vault ID, and the chain must be valid. If the list's current `serverPin` differs from the hello pin, the vault has moved: B reconnects to the last `newAddress` and starts again.
4. B reads the head header and the envelope. The envelope's hash must equal the head's `envelopeHash`.
5. B derives `envKey`, decrypts the envelope, and checks that its recovery keys match the list's current recovery record.
6. The head must descend from the envelope's `checkpoint`. This is checked through headers only, because older file lists may be pruned.
7. If B is rejoining, it classifies the chain (§ 6 No longer a member) and aborts on a rollback or fork.
8. B unwraps recovery's wrap of the current epoch. Recovery signs add-device for B with a fresh wrap, numbering B's name as in § 12 step 10 if it's taken.
9. B makes the kit-join swap with the ticket. Then B erases the recovery keys.
10. Every other device prints "*B* joined with the recovery kit" on its next command.

**Remove a device** (fresh): a remove-device with a new epoch, wrapped to the remaining members.
- envden recommends replacing the recovery key in the same entry (remove + new kit) when the removed device ever held the recovery key (§ 6).
- Otherwise, erasure of the recovery key from memory is trusted.

**Replace the recovery kit** (kit lost, password known, fresh):
1. Generate new recovery keys and a new `SK`.
2. Make the replace-kit swap: replace-recovery with a new epoch, a new envelope and a new `skPub`.
3. Print the new kit.

**Change the password** (old password and kit in hand, fresh):
1. Read the envelope, decrypt it with the old password and `SK`, and register the new password.
2. Make the change-password swap: the envelope resealed with the same recovery keys and `SK`, and the new `opaqueRecord`.

The kit stays valid.

**Reset a forgotten password** (a member device and the kit):
1. The device proves `SK` and reads what it needs (§ 11).
2. It generates new recovery keys and registers the new password with the `SK` proof.
3. It makes the reset-password swap: replace-recovery with a new epoch, the envelope sealed with the new password, the same `SK` and the new recovery keys, and the new `opaqueRecord`.

The printed kit stays valid, because `SK` is unchanged.

**Server move** (device D, old server O, new server N):
1. D logs in fresh on O. The typed password stays in memory until step 5.
2. D does hello against N's setup-token pin. It opens a move session on N with a token proof: N consumes the token and creates an inactive vault bound to D's device ID and the vault ID. The session survives restarts.
3. D starts a move on O (fresh). O records D's move session and freezes: it then rejects every swap except D's server-moved swap. Any member with a fresh login can unfreeze O, which voids the move. O refuses to unfreeze once it has committed the server-moved swap.
4. D reads everything from O and uploads it to N's session:
   - every header, entry, body and blob
   - the keyrings, the envelope and `skPub`
   - the unlock period

   N verifies the whole chain from genesis and every blob hash. D registers the password on N through the session.
5. D builds one server-moved swap (`newPin` = N's pin, `newAddress` = N's address) and stores it locally. It submits the swap to O, which then turns permanently read-only, and then to N. N accepts only a server-moved swap that extends its imported head with `newPin` = its own pin, signed by a member, from any member. Then it activates the vault and closes the session. Each submission is idempotent.

**Resuming and aborting.**
- `envden server move --resume` continues from any step. That includes after O has committed and N hasn't: D resubmits its stored swap to N.
- `--abort` first asks O to unfreeze. If O refuses because it already committed, abort stops and tells the user to resume. Otherwise it discards N's session.
- If D is lost: before O commits, any member unfreezes O. After O commits, any member that reads the server-moved header and entry from O submits them to N, which activates.
- Until N activates, N answers other devices with "moving". They retry later, and resubmit O's server-moved swap if they've seen it.

**After the move.** Other devices find the server-moved entry on O and switch to `newAddress`. They accept only `newPin`, and require descent from their checkpoint. A device that missed the entry, because O is gone, runs `envden server switch <address>`. It checks that N's list holds a server-moved entry to N's pin, descending from its checkpoint.

**Repair after a restore.** After restoring a backup, the operator starts the server with `envden serve --restored`. It prints one repair token per vault, `b32(0x02 ‖ secret(20) ‖ serverPin(32))`, and each vault is in restored mode until its own repair finishes. In restored mode the vault rejects every swap and read except those below, and every repair request needs that vault's repair-token proof. The allowed reads are headers, entries, file lists, keyrings, blobs, reports, the envelope and `restoredHead`, and only members may make them. The server records the head it was restored at as `restoredHead`, in the database. Running `--restored` on a vault already in restored mode, such as a backup taken mid-repair, keeps the recorded `restoredHead` and only mints a new token, which replaces the old one. A vault frozen for a move is unfrozen and its move session dropped, which voids the move as an unfreeze would. Two kinds of vault never enter restored mode, and `--restored` names them instead of printing a token: an inactive move destination, which resumes or aborts its move like after a crash (if devices then find it behind, the operator runs `--restored` again once it activates), and a vault that moved away, which stays read-only so devices that missed the server-moved entry can still read it. The token matters because the restored device list may still include a device removed after the backup.

**Reused tokens.** A device refuses a repair token whose `repairId` already appears in a repair-done entry in a chain it holds. The server mints the token, so this stops a server from reissuing an old one and replaying that repair's reports.

`repairId` = `H("repair-id", secret)`, computed by devices from the token.

1. **Upload.** Each member device runs `envden server repair` with the token. It uploads its repair material (§ 6) and a signed report:
   ```
   RepairReport (0x0B) { type, version, vaultId b32, repairId b32, head b32, blobs list<b32> sorted, signer b16 }
   ```
   `head` is the header the device reached, and `blobs` lists every live blob it holds.
   - The server accepts the upload only if the headers and entries validly extend its current head, and the uploader is a member at the extension's head.
   - A device whose checkpoint is behind the server's head just verifies the head as usual (§ 6) and reports.
   - A device whose checkpoint isn't on the server's chain stops. It gets the fork rule, or the no-longer-a-member rule (§ 6).
   - Blobs go up before the headers that name them. Historical bodies and blobs may be missing.
   - Devices can't pull in restored mode, so a report stays true for the rest of the repair.
2. **Finish.** Any repaired member runs `envden server repair --finish`. The device makes every decision below itself. The server only stores the outcome, so `--finish` resumes after a crash, and restored mode lasts until the last step commits. It warns first that devices added since the backup must repair before the finish, or they'll have to rejoin.
   1. **Drop.** Each device named with `--without <device>` gets an op-4 remove swap, authorized by the token.
   2. **Every member must report.** The device fetches all reports and keeps those with a valid signature, the right `repairId`, a signer who is a member at the head, and a `head` on the chain. If any member at the head has none, it stops and names them. The user repairs them, or reruns with `--without`.
   3. **Missing blobs.** A live entry at the head is missing if the server lacks its blob.
      - If a kept report lists that blob, the server is withholding it or an upload was cut off. The finish stops and tells that device to repair again.
      - Otherwise the file is lost. The finish lists lost files by repo and path, from their `name`, and stops.
   4. **`--accept-lost`.** It makes one op-11 swap covering every lost file:
      - **Recovered (state 3).** The device takes the newest older version whose `blobHash` is in a file list matching the `filesHash` of a verified header, and whose blob the server has. It stops searching at a tombstone, and at any version whose file list it can't get, since that list might hide a newer tombstone. It decrypts the version and writes it as a new version in the current epoch, showing that version's date first.
      - **Lost (state 4).** If no such version exists, it writes a tombstone.
   5. **Password and close.** The user types the password. The device decides from the chain, not from the envelope, which may have been re-uploaded:
      - If any op 8 or 9 lies after `restoredHead`, the restored OPAQUE record is stale, so the device re-registers the password with the token proof.
      - Otherwise it logs in normally with the token proof.
      - The server enforces the same rule.
   6. **Commit.** The device submits the op-12 swap, with the `repairId` and `restoredHead`, together with the finish of that login or registration. On committing op 12, and only then, the server checks that `restoredHead` equals its recorded value; repair-done entries from earlier repairs, met in uploads or a move import, aren't compared. In one transaction the server commits both, takes the vault out of restored mode, consumes the token and deletes the reports.
3. **Kit after a repair.**
   - If any op 5 or 7 lies after `restoredHead`, the server's `skPub` is stale.
   - If the server's envelope doesn't match the head's `envelopeHash`, the kit can't open the vault.

   In either case the server refuses `SK` proofs until the next kit replacement, a flag kept in its database. While set, the server refuses move freeze and SK public-key export. envden asks the user to replace the kit now, using the fresh login it just made.
4. The unlock period may have reverted, so envden shows it for the user to confirm.

**What restored mode trusts.** Only someone holding the repair token, meaning the operator, can act in restored mode. During that window it accepts member signatures without a password, which weakens only the honest-server guarantees (expiry and fresh login). Everything uploaded is signed and verified like any other history.

**Downgrades.** Once a release writes a new format, older releases can't read that history. A downgrade is supported only before any new-format data exists. Restoring a `pre-<version>` copy never rolls back a device's checkpoint or stored headers, which live outside the store (DESIGN § Updates).

## 14. Test vectors and cases

Shipped as JSON in `packages/core/src/protocol/__tests__/vectors/`, and run in CI against every platform binary:

- **Encoding**:
  - round trips
  - rejection of every malformed case in § 2
  - padding checks
  - `b32` trailing bits
  - NFC and `normPw`
- **Derivations**:
  - device, recovery and server-pin IDs
  - file IDs, including path-normalization cases
  - file, keyring and envelope keys
  - `skPub`, setup-token, repair-token and `SK` proofs
  - file-name boxes
  - the secret-key text and checksum
  - pairing-code normalization and the pairing identifiers
- **Encryption**:
  - file, keyring and envelope blobs at fixed nonces
  - a share opened by an independent AES-GCM and by the page's WebCrypto code, and refused under another ID, key or version, or with any flipped byte
  - HPKE wraps at a fixed ephemeral key
  - a low-order point
- **Signatures**: every type label, including cross-type rejection (for example, a manifest signature presented as an entry signature), and rejection of a noncanonical R and of S ≥ L.
- **Swap operations**: every row of the § 6 table accepted with the right fields and authorization, and rejected with:
  - a header whose `op` doesn't match its changes
  - a request not signed by `header.signer`, and the allowed op-10 forward on N
  - a missing field
  - an extra field
  - extra entries
  - file changes outside a push
  - the wrong authorization
- **Retries**: an exact retry succeeds, and a different body for a committed header is rejected.
- **Device-list cases**, each marked valid or invalid:
  - a valid chain
  - a wrong parent
  - a non-member signer
  - a removed device signing
  - the recovery key signing anything other than add-device
  - self-removal
  - a skipped epoch
  - wrap recipients ≠ members
  - a reused device or recovery ID
  - remove-device with `newRecovery`
  - rename-device by another member, by a non-member or the recovery key, to a taken or unchanged name, and to an invalid name
- **Manifest cases**:
  - descent over skipped manifests across epochs
  - a rollback
  - a fork at equal seq
  - a bad header signature
  - an epoch lagging the list
  - a keyring change within an epoch
  - a dropped file ID
  - the same version with a different entry
  - a version decrease
  - a recovery-only signer
  - an envelope change without an allowed operation
- **Pairing**:
  - stored-state vectors for both finish calls
  - a wrong code
  - a second `KE1`
  - a pin mismatch
  - a resumed `PairApprover` after a lost first fetch
  - an identical `KE1` resubmitted after a lost response, and a different one closing the mailbox
  - `PairJoiner` before and after `KE3`
  - an orphaned device
- **Flows**, as an end-to-end test against a real server:
  - create
  - pair
  - kit join after a server move
  - remove with `newRecovery`
  - password change, and reset with only a device and the kit
  - a server move crashing at every step, including between the two step-5 submissions
  - repair after a restore that predates a new device, a password change and a kit replacement
  - repair where no surviving device uses one repo, with and without `--accept-lost`
  - repair without the token; a removed device that is a member at the restored head
  - a report replayed from an earlier repair (wrong `repairId`)
  - an offline device crossing an op-11 header followed by ordinary pushes
  - a dropped device, and a device joined after the backup, rejoining
  - two vaults on one restored server finishing independently
  - a reissued repair token whose `repairId` is already in the chain
  - a password change, and a kit replacement, after the backup point, with the newer envelope re-uploaded
  - a removed device offered a rejoin on a pre-join head (must abort)
  - a restore of a backup taken mid-repair (keeps `restoredHead`)
  - a device still a member on its branch, told it was removed, with a repair-done on the other branch (must abort)
  - a removed device and the server forking from before its removal, removing a device and adding a repair-done (must abort), directly or through a device it adds
  - a server move after a repair, and a second restore whose uploads cross an earlier repair-done
  - a pairing rejoin that aborts and leaves an orphan
  - an op 12 whose `restoredHead` isn't on the chain (devices reject), and one on the chain but not the recorded value (server rejects)
  - `--without` with a missing live blob still referenced
  - `--finish` with an unreported member, and with `--without`
  - a server withholding a blob that a report lists
  - an older version offered for recovery that no verified file list names
  - a crash at every step of `--finish`
  - reset from a locked device several headers behind
  - a server move where D disappears before and after O commits
  - a member lockout attempt from a stolen device
- **Versions**: a client below `minClient` gets `426` and re-checks the signed hello; a server below `minServer` is refused; a new entry kind is rejected while `minClient` is too low; an unknown entry kind with a valid signature reports "update required", and one with a bad signature reports "invalid data".
- **Repo ID** normalization (DESIGN § Store).

## 15. Releases

GitHub Releases holds the stable platform binaries and their `SHA256SUMS` file. The CLI resolves the newest stable tag through GitHub's public release redirect, with the REST API as a fallback. Script installs download this platform's build and the checksums from that same tag, verify SHA-256, refuse a version that is not strictly newer, and replace the binary atomically. Versions use strict `X.Y.Z` comparison. Package-manager installs delegate to the manager.

Daily checks cache their result in `~/.envden/state`. A failed lookup never blocks a command. Update integrity rests on GitHub and TLS. The server's signed `minClient` and the 426 verification rules in § 10 still enforce compatibility.

## 16. Shares

A share hands one file to one person who may have no envden and no tailnet (DESIGN § Shares). It has nothing to do with a vault: no vault key, device key or server is involved.

- **Secrets.** The sender draws a 16-byte share ID and a 32-byte key from the CSPRNG for each share. Both travel as unpadded base64url; decoders reject padding, other alphabets and nonzero trailing bits.
- **Link.** `https://<node>:10000/s/<id>#<key>`. The key sits in the fragment, which browsers never send in a request, so neither Tailscale nor the sender's listener sees it.
- **Box.** `u8 1 ‖ random nonce(12) ‖ AES-256-GCM(key, nonce, plaintext, AD)` with `AD = ctx("share") ‖ u8 1 ‖ b16 id`. The plaintext is the file's bytes, at most 1 MiB. Binding the ID means a box served under another share's link doesn't open, and the version byte appears in both the box and the AD. AES-GCM replaces XChaCha20-Poly1305 here only because WebCrypto has no XChaCha20.
- **Claim.** `GET /s/<id>` returns the page and never consumes the share. `POST /s/<id>/claim` returns the box once: `200` with the bytes, then `410` to anyone after. A claim after the share's lifetime gets `404`. The sender closes the link after the first `200`.
- **What travels.** Tailscale terminates TLS on the sender's own device, so a Funnel relay sees only TLS traffic. No request carries the key, and the box is AES-GCM ciphertext even inside TLS.

