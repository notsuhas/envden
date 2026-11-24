import { codec, tagged, b32, concat, header } from "../../encoding/binary.ts";

export interface IJoinOffer {
  vaultId: Uint8Array;
  nonce: Uint8Array;
}

export const JoinOfferCodec = codec<IJoinOffer>(
  (r) => {
    tagged(12, r);

    return { vaultId: b32.read(r), nonce: b32.read(r) };
  },
  (v) => concat(header(12), b32.write(v.vaultId), b32.write(v.nonce)),
);
