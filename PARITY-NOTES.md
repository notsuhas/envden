
## HPKE fixed-ephemeral wrapping blocks the Rust port

- Scenario: reproduce `protocol.json`'s wrap with the vector RNG returning bytes 0 through 31.
- TS behaviour: `sealWrap` imports those bytes directly as the X25519 ephemeral private key. The encapsulated public key is `8f40c5adb68f25624ae5b214ea767a6ec94d829d3d7b5e1ad1ba6f3e2138285f`.
- Rust dependency constraint: pinned `hpke-rs` 0.8.0 routes DH encapsulation through `kem::encaps` → `dh_kem::encaps` → `derive_key_pair`, producing `b1f1b840de7a3241b02748cf9b05b74dc8c5e8451298738817bd76aa8ebe8c2b` from those bytes. This path does not call the provider's `kem_key_gen`, so replacing the provider RNG/key-generation method cannot preserve TS bytes.
- Possible improvement: expose raw ephemeral-key injection in an HPKE library, or patch the library to accept it while retaining its HPKE implementation. Keep TS behaviour and existing vectors unchanged.
- Why: a temporary Rust test confirmed both public keys against the shared vector. Reimplementing encapsulation or intercepting labeled KDF operations in the provider would violate the agreed crypto boundary. No TS bug is identified here.
