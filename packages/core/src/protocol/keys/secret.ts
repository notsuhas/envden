import { ed25519 } from "@noble/curves/ed25519.js";
import { b32, b16 } from "../encoding/binary.ts";

import { KDF } from "../crypto/kdf.ts";

export function skSeed(secret: Uint8Array, vaultId: Uint8Array): Uint8Array {
  return KDF(b16.write(secret), b32.write(vaultId), "sk-sign");
}

export function skPub(secret: Uint8Array, vaultId: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(skSeed(secret, vaultId));
}
