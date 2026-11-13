import { validateEdPublic } from "./validation.ts";

import { b32, concat } from "../encoding/binary.ts";
import { H } from "../crypto/hash.ts";

export function deviceId(keys: {
  encPub: Uint8Array;
  objPub: Uint8Array;
  reqPub: Uint8Array;
}): Uint8Array {
  return H(
    "device-id",
    concat(b32.write(keys.encPub), b32.write(keys.objPub), b32.write(keys.reqPub)),
  ).slice(0, 16);
}

export function recoveryId(keys: { encPub: Uint8Array; objPub: Uint8Array }): Uint8Array {
  return H("recovery-id", concat(b32.write(keys.encPub), b32.write(keys.objPub))).slice(0, 16);
}

export function serverPin(pub: Uint8Array): Uint8Array {
  validateEdPublic(pub);

  return H("server-pin", pub);
}
