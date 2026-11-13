# Server HTTP reference

All routes except hello use signed request headers. `Envden-Body-Hash` carries the base64url SHA-256 of the body. Vault ID is in `Envden-Request`, not the URL. Hash path parameters and binary JSON fields are base64url. Binary bodies use the existing core codecs. Errors are `{ error: TErrorCode }` with the status from `http/errors.ts`.

| Method and path | Request | Response | Authorization |
|---|---|---|---|
| GET `/v1/hello?challenge=` | 32-byte challenge | `{ hello }`, signed ServerHello | public |
| POST `/v1/vault` | binary SwapCodec: op 0, entries `[genesis, entry1]`, empty Files, keyring, envelope, skPub, opaqueRecord; zero expectedHead | `{ kind: "committed" \| "retry-of-committed" }` | setup proof, staged registration |
| POST `/v1/swap?mailbox=N` | binary SwapCodec; mailbox only for op 2 | `{ kind: "committed" \| "retry-of-committed" }`, or 409 `{ kind: "head-moved", head }` | operation's required authorization |
| GET `/v1/devices` | empty | `{ devices: [{ id, clientVersion, confirmed }] }` | unlocked member |
| GET `/v1/head` | empty | binary signed ManifestHeader | read gate |
| GET `/v1/headers?from=1&to=20` | inclusive decimal sequence range | `{ objects: [base64url signed ManifestHeader] }` | read gate |
| GET `/v1/entries?from=0&to=20` | inclusive decimal sequence range | `{ objects: [base64url signed Entry] }` | read gate |
| GET `/v1/files/:hash` | empty | binary Files | read gate; ticket/SK limited to head list |
| GET `/v1/keyrings/:hash` | empty | raw keyring ciphertext | read gate; ticket/SK limited to current keyring |
| GET `/v1/envelope` | empty | raw envelope ciphertext | fresh member, ticket or SK proof |
| GET `/v1/blobs` | empty | `{ objects: [base64url blob hash] }` | unlocked member |
| GET `/v1/blobs/:hash` | empty | raw ciphertext | unlocked member |
| PUT `/v1/blobs/:hash` | raw ciphertext, nonempty, at most 16 MiB; H("blob", body) equals hash | `{ kind: "uploaded" }` | unlocked member, repair proof or move owner |
| POST `/v1/move/session` | empty | `{ kind: "moving" }` | setup proof; retry by session owner |
| POST `/v1/move/discard` | empty | `{ kind: "unfrozen" }`; consumed setup token stays invalid | move owner |
| GET `/v1/move/sk-pub` | empty | raw SK public key | fresh member |
| GET `/v1/move/period` | empty | `{ period }` | fresh member |
| POST `/v1/move/freeze` | empty | `{ kind: "frozen" }` | fresh member; records move owner |
| POST `/v1/move/unfreeze` | empty | `{ kind: "unfrozen" }` | fresh member; refused after op 10 |
| POST `/v1/move/history` | binary SwapCodec containing each historical header and its entries, in order; start with creation | storage commit result | move owner |
| POST `/v1/move/chain` | binary `list(SwapCodec)`, ordered history batch | storage commit result | move owner |
| PUT `/v1/move/material/:kind/:hash` | raw keyring, envelope, skPub or Files (`kind=files`); files must match a stored header | `{ kind: "uploaded" }` | move owner |
| PUT `/v1/move/period` | `{ period: 86400000 \| 604800000 \| 2592000000 \| null }` | `{ kind: "updated" }` | move owner |
| POST `/v1/repair/history` | binary SwapCodec containing each extension header and its entries | storage commit result | repair proof; uploader must be member at extension head |
| POST `/v1/repair/chain` | binary `list(SwapCodec)`, ordered extension; uploader must be member at final head | storage commit result | repair proof |
| PUT `/v1/repair/material/:kind/:hash` | same as move material | `{ kind: "uploaded" }` | repair proof |
| POST `/v1/repair/finish` | `{ kind: "login", purpose: "unlock", message: KE3, swap: base64url SwapCodec }` or `{ kind: "registration", message: registrationRecord, swap }`; swap must be op 12 | commit result | repair proof |
| GET `/v1/repair/status` | empty | `{ restoredHead, repairId }` | repair proof |
| PUT `/v1/repair/report` | binary signed RepairReport | `{ kind: "stored" }` | repair proof; report signer must equal request device |
| GET `/v1/repair/reports` | empty | `{ objects: [base64url signed RepairReport] }` | repair proof |

Read gate means unlocked member, or a join ticket/SK proof for its allowed read set. Restored mode replaces all read gates with repair proof and blocks normal writes. Inactive move destinations answer `MOVING` outside import/registration/activation routes. Op 10 on N accepts any imported member forwarding the signed swap, with N's pin.

Historical uploads may omit pruned bodies and credential ciphertext. Op-11 lists and their predecessors are required. Re-upload missing lists through `material/files/:hash`. Historical OPAQUE records never replace live credentials. Destination registration is persisted through its move session until activation.

OPAQUE routes remain POST `/v1/opaque/{login,registration}/{start,finish}` with the core schemas. Registration finish stages the record. Restored login finish stages verified login authority without unlocking. Submit op 12 with the final finish message through `/v1/repair/finish`, or consume staged finish authority through `/v1/swap`, using the repair proof: it atomically consumes that authority or staged registration, commits the close, unlocks the device and deletes reports. A restarted repair changes the token and invalidates staged finish authority.

Pairing remains POST `/v1/pairing/mailboxes`, GET/PUT `/v1/pairing/mailboxes/:number/:slot`, DELETE `/v1/pairing/mailboxes/:number`, and GET `/v1/pairing/approver`. Slot writes use `{ message }`; reads return `{ message }` or `{ kind: "pending" }`. Pair swaps consume the mailbox and persist the encrypted approver for 24 hours.

GET `/v1/settings/unlock-period` returns `{ period }` using the core `UnlockPeriodSchema`. It requires an unlocked member, no fresh login, and no body or body reservation. PUT on the same route still requires a fresh login. Auth and pairing bodies are capped at 64 KiB, blobs at 16 MiB, and history, material and swaps at 32 MiB. Only exact method and route pairs are admitted. Read routes reject bodies. Content-Length and streamed bytes are checked before buffering. Bodies reserve twice the route cap: members have 128 MiB reserved exclusively for them; public login and pairing traffic share 1 MiB with at most eight concurrent bodies. Non-member uploads authorized by setup, join, move or repair proofs use a separate 128 MiB pool with at most two concurrent bodies. Neither pool can consume member capacity. Bodiless requests reserve nothing. Public login and registration starts are rate-limited before reservation. A body must finish within 10 seconds, including trickled uploads; expiry cancels the stream. Exhaustion returns `BUSY` (503); clients retry twice with 100 ms and 200 ms backoffs. History pages return at most 100 rows and 1 MiB; continue from the last decoded sequence plus one until the page is empty. Blob storage is capped at 1 GiB per vault. Uncommitted uploads expire after 24 hours. History pruning runs hourly with a 90-day window and at least 20 versions per file, retaining repair lists permanently.

Use a repair chain batch when the uploading device was added after the backup. The batch commits atomically and checks membership at its final head. Coded unknown protocol formats return `SERVER_TOO_OLD` (426).
