import { test, expect } from "bun:test";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { CipherSuite, HkdfSha256 } from "@hpke/core";
import { DhkemX25519HkdfSha256 } from "@hpke/dhkem-x25519";
import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";
import vectors from "../../__tests__/vectors/known.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex")),
  hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

test("RFC 5869 HKDF SHA256 case 1", () => {
  const v = vectors.hkdf;
  expect(hex(hkdf(sha256, from(v.ikm), from(v.salt), from(v.info), 42))).toBe(v.okm);
});

test("RFC 4231 HMAC SHA256 case 1", () => {
  const v = vectors.hmac;
  expect(hex(hmac(sha256, from(v.key), new TextEncoder().encode(v.message)))).toBe(v.hash);
});

test("RFC 8032 Ed25519 test 1 strict verification", () => {
  const v = vectors.ed25519;
  expect(hex(ed25519.getPublicKey(from(v.seed)))).toBe(v.public);
  expect(hex(ed25519.sign(new Uint8Array(), from(v.seed)))).toBe(v.signature);

  expect(
    ed25519.verify(from(v.signature), new Uint8Array(), from(v.public), { zip215: false }),
  ).toBe(true);
});

test("RFC 7748 X25519 Alice public key", () => {
  const v = vectors.x25519;
  expect(hex(x25519.getPublicKey(from(v.secret)))).toBe(v.public);
});

test("libsodium XChaCha20 Poly1305 known answer", () => {
  const v = vectors.xchacha;

  expect(
    hex(
      xchacha20poly1305(from(v.key), from(v.nonce), from(v.ad)).encrypt(
        new TextEncoder().encode(v.message),
      ),
    ),
  ).toBe(v.ct);
});

test("RFC 9180 base X25519 HKDF SHA256 ChaCha20 Poly1305", async () => {
  const v = vectors.hpke,
    suite = new CipherSuite({
      kem: new DhkemX25519HkdfSha256(),
      kdf: new HkdfSha256(),
      aead: new Chacha20Poly1305(),
    });

  const recipientPublicKey = await suite.kem.importKey("raw", from(v.pkRm), true),
    privateKey = await suite.kem.importKey("raw", from(v.skEm), false),
    publicKey = await suite.kem.importKey("raw", from(v.pkEm), true);

  const result = await suite.seal(
    { recipientPublicKey, info: from(v.info), ekm: { privateKey, publicKey } },
    from(v.pt),
    from(v.aad),
  );

  expect(hex(new Uint8Array(result.enc))).toBe(v.enc);
  expect(hex(new Uint8Array(result.ct))).toBe(v.ct);
});
