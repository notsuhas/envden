import { codec, b32, concat } from "../../encoding/binary.ts";
import { str } from "../../encoding/strings.ts";

export interface IServerMoved {
  oldPin: Uint8Array;
  newPin: Uint8Array;
  newAddress: string;
}

export const ServerMovedCodec = codec<IServerMoved>(
  (r) => {
    return { oldPin: b32.read(r), newPin: b32.read(r), newAddress: str.read(r) };
  },
  (v) => concat(b32.write(v.oldPin), b32.write(v.newPin), str.write(v.newAddress)),
);
