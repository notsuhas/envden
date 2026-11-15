import { EnvdenError } from "@envden/core/errors";
import {
  concat,
  decode,
  DeviceRecordCodec,
  encode,
  generateDeviceKeys,
  equal,
  deviceId,
  type IDeviceRecord,
} from "@envden/core/protocol";

interface ISecretKeys {
  encSk: Uint8Array;
  objSk: Uint8Array;
  reqSk: Uint8Array;
}

export function identityBytes(keys: ISecretKeys, record: IDeviceRecord) {
  return concat(keys.encSk, keys.objSk, keys.reqSk, encode(DeviceRecordCodec, record));
}

export function readIdentity(stored: Uint8Array) {
  if (stored.length < 96) throw new EnvdenError("INVALID_DATA", "Invalid device identity");

  const keys = {
    encSk: stored.slice(0, 32),
    objSk: stored.slice(32, 64),
    reqSk: stored.slice(64, 96),
  };

  const record = decode(DeviceRecordCodec, stored.slice(96));
  const seeds = [keys.encSk, keys.objSk, keys.reqSk];
  let cursor = 0;
  const derived = generateDeviceKeys(() => seeds[cursor++]!);

  if (
    !equal(derived.encPub, record.encPub) ||
    !equal(derived.objPub, record.objPub) ||
    !equal(derived.reqPub, record.reqPub)
  )
    throw new EnvdenError("INVALID_DATA", "Device keys do not match their public record");

  if (!equal(deviceId(record), record.id))
    throw new EnvdenError("INVALID_DATA", "Invalid device identity");

  return { keys: { encSk: keys.encSk, objSk: keys.objSk, reqSk: keys.reqSk }, record };
}
