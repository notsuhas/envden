import { requireValue, b32, encode, equal } from "../encoding/binary.ts";

import { type TVerification } from "../crypto/sign.ts";
import { H } from "../crypto/hash.ts";
import { MAC } from "../crypto/mac.ts";

import { type IRequest } from "../codecs/server/request.ts";
import { RequestCodec } from "../codecs/server/request.ts";

export function tokenKey(kind: "setup" | "repair", secret: Uint8Array): Uint8Array {
  requireValue(secret.length === 20);

  return H(kind + "-token", secret);
}

export function tokenProof(
  kind: "setup" | "repair",
  key: Uint8Array,
  request: IRequest,
): Uint8Array {
  return MAC(
    b32.write(key),
    kind === "setup" ? "token-proof" : "repair-proof",
    encode(RequestCodec, request),
  );
}

export function verifyTokenProof(
  kind: "setup" | "repair",
  key: Uint8Array,
  request: IRequest,
  proof: Uint8Array,
): TVerification<true> {
  return equal(proof, tokenProof(kind, key, request))
    ? { ok: true, value: true }
    : { ok: false, reason: "Invalid token proof" };
}
