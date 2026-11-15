import { codec, b16, concat, requireValue } from "../../encoding/binary.ts";
import { str } from "../../encoding/strings.ts";
import { isDeviceName } from "../members/device-name.ts";

export interface IRenameDevice {
  device: Uint8Array;
  name: string;
}

export const RenameDeviceCodec = codec<IRenameDevice>(
  (r) => {
    return { device: b16.read(r), name: str.read(r) };
  },
  (v) => concat(b16.write(v.device), str.write(v.name)),
  (v) => requireValue(isDeviceName(v.name), "Invalid device name"),
);
