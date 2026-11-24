import { encode } from "../encoding/binary.ts";
import { proofSeed } from "../recovery/proof-key.ts";
import { type TVerification } from "../crypto/sign.ts";
import { Sign, Verify } from "../crypto/sign.ts";
import { type IRequest } from "../codecs/server/request.ts";
import { RequestCodec } from "../codecs/server/request.ts";

export function signRecoveryProof(code: Uint8Array, request: IRequest): Uint8Array {
  return Sign(proofSeed(code), "recovery-proof", encode(RequestCodec, request));
}

export function verifyRecoveryProof(
  pub: Uint8Array,
  request: IRequest,
  proof: Uint8Array,
): TVerification<true> {
  return Verify(pub, "recovery-proof", encode(RequestCodec, request), proof);
}
