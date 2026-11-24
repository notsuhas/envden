import { type IDeviceRecord } from "../codecs/members/device.ts";
import { DeviceRecordCodec } from "../codecs/members/device.ts";
import { b32, concat, equal } from "../encoding/binary.ts";
import { H } from "../crypto/hash.ts";

export function joinCommit(pin: Uint8Array, device: IDeviceRecord, nonce: Uint8Array): Uint8Array {
  return H(
    "join/commit",
    concat(b32.write(pin), DeviceRecordCodec.write(device), b32.write(nonce)),
  );
}

export function opensCommit(
  commit: Uint8Array,
  pin: Uint8Array,
  device: IDeviceRecord,
  nonce: Uint8Array,
): boolean {
  return equal(commit, joinCommit(pin, device, nonce));
}
