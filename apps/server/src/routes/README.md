# Server HTTP reference

All routes except hello and status use signed request headers. `Envden-Body-Hash` carries the base64url SHA-256 of the body. Vault ID is in `Envden-Request`, not the URL. Hash path parameters and binary JSON fields are base64url. Binary bodies use the existing core codecs. Errors are `{ error: TErrorCode }` with the status from `http/errors.ts`.

| Method and path | Request | Response | Authorization |
|---|---|---|---|
| GET `/v1/hello?challenge=` | 32-byte challenge | `{ hello }`, signed ServerHello | public |
| GET `/` and GET `/v1/status` | empty | HTML page, or `{ version, uptimeSeconds, mode, vaults, storageBytes, fullestVault, lastPrune }` | public; 404 when `ENVDEN_STATUS_PAGE=off` |
| POST `/v1/vault` | binary SwapCodec: op 0, entries `[genesis, entry1]`, empty Files, keyring, envelope, proofPub; zero expectedHead | `{ kind: "committed" \| "retry-of-committed" }` | setup proof |
| POST `/v1/swap?request=N` | binary SwapCodec; request only for op 2 | `{ kind: "committed" \| "retry-of-committed" }`, or 409 `{ kind: "head-moved", head }` | operation's required authorization |
| GET `/v1/devices` | empty | `{ devices: [{ id, clientVersion, confirmed }] }` | member |
| GET `/v1/head` | empty | binary signed ManifestHeader | read gate |
| GET `/v1/headers?from=1&to=20` | inclusive decimal sequence range | `{ objects: [base64url signed ManifestHeader] }` | read gate |
| GET `/v1/entries?from=0&to=20` | inclusive decimal sequence range | `{ objects: [base64url signed Entry] }` | read gate |
| GET `/v1/files/:hash` | empty | binary Files | read gate; ticket limited to head list |
| GET `/v1/keyrings/:hash` | empty | raw keyring ciphertext | read gate; ticket limited to current keyring |
| GET `/v1/envelope` | empty | raw envelope ciphertext | read gate |
| GET `/v1/blobs` | empty | `{ objects: [base64url blob hash] }` | member |
| GET `/v1/blobs/:hash` | empty | raw ciphertext | member |
| PUT `/v1/blobs/:hash` | raw ciphertext, nonempty, at most 16 MiB; H("blob", body) equals hash | `{ kind: "uploaded" }` | member, repair proof or move owner |
| POST `/v1/move/session` | empty | `{ kind: "moving" }` | setup proof; retry by session owner |
| POST `/v1/move/discard` | empty | `{ kind: "unfrozen" }`; consumed setup token stays invalid | move owner |
| GET `/v1/move/proof-pub` | empty | raw recovery proof public key | member; requires a code replacement if recovery proofs are refused |
| POST `/v1/move/freeze` | empty | `{ kind: "frozen" }` | member; requires a code replacement if recovery proofs are refused; records move owner |
| POST `/v1/move/unfreeze` | empty | `{ kind: "unfrozen" }` | member; refused after op 10 |
| POST `/v1/move/history` | binary SwapCodec containing each historical header and its entries, in order; start with creation | storage commit result | move owner |
| POST `/v1/move/chain` | binary `list(SwapCodec)`, ordered history batch | storage commit result | move owner |
| PUT `/v1/move/material/:kind/:hash` | raw keyring, envelope, proofPub or Files (`kind=files`); files must match a stored header | `{ kind: "uploaded" }` | move owner |
| POST `/v1/repair/history` | binary SwapCodec containing each extension header and its entries | storage commit result | repair proof; uploader must be member at extension head |
| POST `/v1/repair/chain` | binary `list(SwapCodec)`, ordered extension; uploader must be member at final head | storage commit result | repair proof |
| PUT `/v1/repair/material/:kind/:hash` | same as move material | `{ kind: "uploaded" }` | repair proof |
| GET `/v1/repair/status` | empty | `{ restoredHead, repairId }` | repair proof |
| PUT `/v1/repair/report` | binary signed RepairReport | `{ kind: "stored" }` | repair proof; report signer must equal request device |
| GET `/v1/repair/reports` | empty | `{ objects: [base64url signed RepairReport] }` | repair proof |
| POST `/v1/recovery/ticket` | `{ proofPub }`; `Envden-Proof` is the recovery proof; zero vault ID | `{ vaultId }`, and a join ticket for the requesting device | non-member, rate-limited per vault |
| POST `/v1/join-requests` | `{ commit }`; zero vault ID | `{ number, expiresAt }` | non-member; 10 openings per hour per server |
| GET `/v1/join-requests` | empty | `{ requests: [{ number, name, expiresAt }] }`, open and unclaimed only | member |
| GET/PUT `/v1/join-requests/:number/offer` | `{ message }` (PUT) | `{ message, expiresAt }` or `{ kind: "pending", expiresAt }` | read: the joiner; write: any member while unclaimed, which claims it |
| GET/PUT `/v1/join-requests/:number/reveal` | `{ message }` (PUT) | as above | read: the claimer; write: the joiner, after the offer |
| DELETE `/v1/join-requests/:number` | empty | `{ kind: "closed" }` | the joiner or the claimer |
| GET `/v1/join-requests/approved` | empty | `{ message }`, the JoinApproved | the joined device, by device ID, for 24 hours |

Read gate means member, or a join ticket for its allowed read set. Restored mode replaces all read gates with repair proof and blocks normal writes. Inactive move destinations answer `MOVING` outside import/registration/activation routes. Op 10 on N accepts any imported member forwarding the signed swap, with N's pin.

Historical uploads may omit pruned bodies and credential ciphertext. Op-11 lists and their predecessors are required. Re-upload missing lists through `material/files/:hash`.

Join request slots are written once; an identical resubmission succeeds and a different one closes the request. Op 2 consumes the claimed request and stores the JoinApproved for 24 hours. Op 12 goes through `/v1/swap` with the repair proof: it commits the close, takes the vault out of restored mode and deletes reports. A restarted repair changes the token.

Auth and join bodies are capped at 64 KiB, blobs at 16 MiB, and history, material and swaps at 32 MiB. Only exact method and route pairs are admitted. Read routes reject bodies. Content-Length and streamed bytes are checked before buffering. Bodies reserve twice the declared Content-Length, or twice the route cap when absent; streamed bytes cannot exceed that reservation: members have 128 MiB reserved exclusively for them; public recovery and join traffic share 1 MiB with at most eight concurrent bodies. Non-member uploads authorized by setup, join ticket, move or repair proofs use a separate 128 MiB pool with at most two concurrent bodies. Neither pool can consume member capacity. Bodiless requests reserve nothing. A body starts with a 10-second deadline. Each received 32 KiB adds one second to the total deadline, capped at 600 seconds; a declared length alone never extends it. Expiry cancels the stream. Exhaustion returns `BUSY` (503); clients retry twice with 100 ms and 200 ms backoffs. History pages return at most 100 rows and 1 MiB; continue from the last decoded sequence plus one until the page is empty. Blobs, retained file lists, version indexes and keyrings share a 1 GiB quota per vault; a swap whose file list adds no blob and isn't bigger than the current one commits even over it. Uncommitted uploads expire after 24 hours. History pruning runs hourly with a 90-day window and at least 20 versions per file, retaining repair lists permanently. Blobs are kept by version, not by list, so a list retained for one file's version keeps no other file's blob.

Status is for any tailnet peer with a browser, so it shows only server-wide totals: never a vault ID, device, file, join request or per-vault count. `mode` is `restored` if any vault is in restored mode and `moved` once every vault has moved away. `fullestVault` is the quota band of the fullest vault. Both routes share 60 requests a minute across all callers, run no scripts, and send a CSP allowing only the page's hashed inline style, plus `frame-ancestors 'none'`, `nosniff`, `no-referrer` and `no-store`.

Use a repair chain batch when the uploading device was added after the backup. The batch commits atomically and checks membership at its final head. Coded unknown protocol formats return `SERVER_TOO_OLD` (426).

Accepted non-member join writes consume a bucket scoped to that request opening, and rejected writers share a separate one. Repair envelopes must match the current head. A refunded recovery attempt resets lockout strikes; strikes also reset after 24 hours beyond the last lockout.
