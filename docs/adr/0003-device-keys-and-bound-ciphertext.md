# Device keys, signed device list, key epochs, OPAQUE pairing

Each device has its own key pairs. The first device creates every vault key locally and the vault ID is the hash of its signed genesis entry. Membership is a hash-chained log of entries signed by existing members, which every device verifies locally, and which only takes effect through the signed manifest swap, so the server can't add members or forge keys. The vault key has epochs: removing a device starts a new epoch for new writes and never re-encrypts old data. Files use an AEAD binding vault, epoch, file and version, and a signed manifest is the single commit point. The secret key lives only in the recovery kit, and the password envelope carries the vault ID and a checkpoint so a kit-only recovery can verify the device list. New devices join with an 8-character code over OPAQUE (`@serenity-kit/opaque`, pinned), and the server enforces unlock expiry through an OPAQUE login with the master password; this relies on an honest server, and sensitive actions always need a fresh login. Exact constructions live in `PROTOCOL.md`.

## Considered Options

- **age for file encryption** (first draft): rejected because age has no associated data, so a malicious server can swap or replay files and they still decrypt, and anyone holding an age recipient can create valid files.
- **Shared secret key on every device, Tailscale identity as auth**: rejected because Tailscale headers name the user, not the device, are empty for tagged devices, and can be forged by local processes on a laptop-hosted server.
- **Device list served by the server**: rejected because the server could add its own key or hand out a fake vault key.
- **Re-encrypting everything on device removal**: rejected because it renames every ID, rewrites append-only history and leaves mixed keys after a crash; the removed device already saw the old data anyway.
- **Secret key stored on devices**: rejected because then every removal must rotate it, silently invalidating printed recovery kits.
- **Pairing link copied between devices**: clumsy to move between machines.
- **Server-issued pairing code, as T3 Code does**: T3 trusts its server; envden's server is untrusted and could swap in its own key.
- **Long typed code (~100 bits) with HMAC instead of a PAKE**: safe but too long to type. An 8-character code without a PAKE can be brute-forced offline by a hijacked server within the pairing window.
- **Writing CPace ourselves**: rejected to avoid maintaining security-critical protocol code.
- **Unlock expiry enforced only by the CLI**: rejected as cosmetic, since nothing stops a thief who never runs the CLI.
- **`@cloudflare/opaque-ts` as a fallback**: not a real fallback; last published 2022 against draft 07.

## Consequences

- Audit coverage of the OPAQUE library is partial: NCC reviewed `opaque-ke` v0.5.0 against draft-03 (2021); 7ASecurity audited the JS wrapper in 2023 (announced 2024), version not confirmed. The pinned release isn't covered. Re-check before release.
- The composition around the libraries (device list, manifest, pairing channel) is envden's own protocol and needs its own review.
- A device recovered from the kit can only detect rollbacks past the checkpoint sealed in the envelope.
- Unlock expiry holds only against a thief, not against a compromised server.
- The server's OPAQUE record lets a compromised server guess the master password offline; the secret key is still needed to open the vault.
- Devices that held the recovery private key in memory (vault creation, kit join, kit replacement, password change or reset) are trusted to have erased it, unless the user replaces the kit when removing them.
- Devices never hold the secret key, so changing the master password needs the recovery kit.
- A server restored from backup is a rollback; it runs in restored mode until members re-upload their newer signed history (`envden server repair`). Restored mode needs a repair token the server prints, and every member must repair or be dropped before it ends. It trusts member signatures without a password, which weakens only the honest-server guarantees during that window. Files whose newest version no device holds can be lost.
- A server alone can show different devices different branches; each device stops as soon as it sees the other branch, but can't detect a branch it's never shown.
- A removed device or an old recovery key colluding with the server can fork history. Values a removed device already pulled can't be revoked; envden lists them so the user can rotate them.
