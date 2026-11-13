import { withStateLock } from "../state/lock/lock.ts";
import type { IKeychainAdapter } from "@envden/core/adapters";
import {
  generateDeviceKeys,
  deviceId,
  concat,
  decode,
  DeviceRecordCodec,
  encode,
  equal,
} from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

async function lockeddeviceIdentity(keychain: IKeychainAdapter, namespace: string, name: string) {
  const slot = `envden/${namespace}/device`;
  const stored = await keychain.get(slot);

  if (stored) {
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

  const keys = generateDeviceKeys();

  const record = {
    id: deviceId(keys),
    name,
    encPub: keys.encPub,
    objPub: keys.objPub,
    reqPub: keys.reqPub,
  };

  await keychain.set(
    slot,
    concat(keys.encSk, keys.objSk, keys.reqSk, encode(DeviceRecordCodec, record)),
  );

  return { keys: { encSk: keys.encSk, objSk: keys.objSk, reqSk: keys.reqSk }, record };
}

export type TDeviceIdentity = Awaited<ReturnType<typeof deviceIdentity>>;

export function deviceIdentity(...args: Parameters<typeof lockeddeviceIdentity>) {
  return withStateLock(args[1], () => lockeddeviceIdentity(...args));
}
