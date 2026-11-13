import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { b32 } from "../encoding/binary.ts";

import { type TRandom } from "../crypto/random.ts";
import { randomBytes } from "../crypto/random.ts";

export function generateRecoveryKeys(rng: TRandom = randomBytes) {
  const encSk = b32.write(rng(32)),
    objSk = b32.write(rng(32));

  return { encSk, objSk, encPub: x25519.getPublicKey(encSk), objPub: ed25519.getPublicKey(objSk) };
}

export function generateDeviceKeys(rng: TRandom = randomBytes) {
  const recovery = generateRecoveryKeys(rng),
    reqSk = b32.write(rng(32));

  return { ...recovery, reqSk, reqPub: ed25519.getPublicKey(reqSk) };
}
