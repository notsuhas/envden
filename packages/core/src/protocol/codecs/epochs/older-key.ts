import { codec, u32, b32, concat } from "../../encoding/binary.ts";

export interface IOlderKey {
  epoch: number;
  key: Uint8Array;
}

export const OlderKeyCodec = codec<IOlderKey>(
  (r) => {
    return { epoch: u32.read(r), key: b32.read(r) };
  },
  (v) => concat(u32.write(v.epoch), b32.write(v.key)),
);
