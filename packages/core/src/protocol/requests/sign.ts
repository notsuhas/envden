import { sha256 } from "@noble/hashes/sha2.js";
import { type IRequest } from "../codecs/server/request.ts";
import { RequestCodec } from "../codecs/server/request.ts";
import { type ISigned } from "../codecs/signed.ts";
import { signObject, verifyObject } from "../crypto/signed-object.ts";
import { type TVerification } from "../crypto/sign.ts";
import { equal } from "../encoding/binary.ts";

export function signRequest(request: IRequest, sk: Uint8Array): ISigned<IRequest> {
  return signObject(RequestCodec, request, sk, "request");
}

export function verifyRequest(
  value: ISigned<IRequest>,
  pub: Uint8Array,
  pin: Uint8Array,
  body: Uint8Array,
  now: bigint,
  nonceSeen: boolean,
): TVerification<IRequest> {
  if (!equal(value.body.serverPin, pin) || !equal(value.body.bodyHash, sha256(body)))
    return { ok: false, reason: "Request binding mismatch" };

  if (!requestTimeValid(value.body.time, now) || nonceSeen)
    return { ok: false, reason: "Expired or replayed request" };

  return verifyObject(RequestCodec, value, pub, "request");
}

export function requestTimeValid(time: bigint, now: bigint): boolean {
  return time >= now - 300000n && time <= now + 300000n;
}

export function nonceStillLive(seenAt: bigint, now: bigint): boolean {
  return seenAt > now - 600000n;
}
