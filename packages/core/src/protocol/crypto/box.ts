import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { EMPTY, requireValue, concat, b32, Reader } from "../encoding/binary.ts";
import { type TRandom } from "./random.ts";
import { randomBytes } from "./random.ts";

export function sealBox(
  key: Uint8Array,
  plaintext: Uint8Array,
  ad: Uint8Array = EMPTY,
  rng: TRandom = randomBytes,
): Uint8Array {
  const nonce = rng(24);
  requireValue(nonce.length === 24);

  return concat(
    Uint8Array.of(1),
    nonce,
    xchacha20poly1305(b32.write(key), nonce, ad).encrypt(plaintext),
  );
}

export function openBox(key: Uint8Array, box: Uint8Array, ad: Uint8Array = EMPTY): Uint8Array {
  const r = new Reader(box);
  requireValue(r.take(1)[0] === 1, "Unknown blob version");
  const nonce = r.take(24);

  return xchacha20poly1305(b32.write(key), nonce, ad).decrypt(r.take(box.length - r.offset));
}
