import { ed25519 } from "@noble/curves/ed25519.js";
import { b16, EMPTY } from "../encoding/binary.ts";
import { KDF } from "../crypto/kdf.ts";

// No vault ID salt: the server finds the vault by this key, and the user holds only the code.
export function proofSeed(code: Uint8Array): Uint8Array {
  return KDF(b16.write(code), EMPTY, "recovery-proof-key");
}

export function proofPub(code: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(proofSeed(code));
}
