import { encode } from "../encoding/binary.ts";

import { skSeed } from "../keys/secret.ts";
import { type TVerification } from "../crypto/sign.ts";

import { Sign, Verify } from "../crypto/sign.ts";
import { type IRequest } from "../codecs/server/request.ts";
import { RequestCodec } from "../codecs/server/request.ts";

export function signSKProof(
  secret: Uint8Array,
  vaultId: Uint8Array,
  request: IRequest,
): Uint8Array {
  return Sign(skSeed(secret, vaultId), "sk-proof", encode(RequestCodec, request));
}

export function verifySKProof(
  pub: Uint8Array,
  request: IRequest,
  proof: Uint8Array,
): TVerification<true> {
  return Verify(pub, "sk-proof", encode(RequestCodec, request), proof);
}
