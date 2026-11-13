import { codec, b32, concat } from "../../encoding/binary.ts";
import { str } from "../../encoding/strings.ts";

export interface IBuild {
  platform: string;
  sha256: Uint8Array;
}

export const BuildCodec = codec<IBuild>(
  (r) => {
    return { platform: str.read(r), sha256: b32.read(r) };
  },
  (v) => concat(str.write(v.platform), b32.write(v.sha256)),
);
