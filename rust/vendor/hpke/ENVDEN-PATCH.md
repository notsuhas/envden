# envden patch to hpke 0.13.0

TS `sealWrap` uses 32 random bytes directly as the X25519 ephemeral private key; stock `hpke` derives it with DeriveKeyPair, so its wraps can't reproduce the protocol vectors.

Changes, nothing else:
- `kem::x25519_hkdfsha256` and its `encap_with_eph` are `pub` (were `pub(crate)`).
- New `setup::setup_sender_with_ephemeral`, re-exported from the crate root: `setup_sender` with a caller-supplied ephemeral key.
- Example and bench targets and the 5.6 MB KAT vector file are dropped from the vendored copy.

Delete this copy once upstream exposes deterministic encapsulation.
