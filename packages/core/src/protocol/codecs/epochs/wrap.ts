import { codec, b16, b32, bytes, concat, requireValue } from "../../encoding/binary.ts";

export interface IWrap {
  recipient: Uint8Array;
  enc: Uint8Array;
  ct: Uint8Array;
}

export const WrapCodec = codec<IWrap>(
  (r) => {
    return { recipient: b16.read(r), enc: b32.read(r), ct: bytes.read(r) };
  },
  (v) => concat(b16.write(v.recipient), b32.write(v.enc), bytes.write(v.ct)),
  (v) => {
    requireValue(v.ct.length === 48, "Invalid wrap ciphertext");
  },
);
