import { codec, u8, b64, concat, requireValue } from "../../encoding/binary.ts";

export interface IReleaseSignature {
  key: number;
  sig: Uint8Array;
}

export const ReleaseSignatureCodec = codec<IReleaseSignature>(
  (r) => {
    return { key: u8.read(r), sig: b64.read(r) };
  },
  (v) => concat(u8.write(v.key), b64.write(v.sig)),
  (v) => {
    requireValue(v.key <= 1, "Unknown release key");
  },
);
