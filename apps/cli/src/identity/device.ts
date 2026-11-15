import { identityBytes, readIdentity } from "./stored.ts";
import { loadState } from "../state/store/repository.ts";
import { withStateLock } from "../state/lock/lock.ts";
import type { IKeychainAdapter } from "@envden/core/adapters";
import { generateDeviceKeys, deviceId } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

async function lockeddeviceIdentity(
  keychain: IKeychainAdapter,
  namespace: string,
  name: string,
  fresh = false,
) {
  const slot = `envden/${namespace}/device`;
  const stored = await keychain.get(slot);

  if (stored && !fresh) {
    return readIdentity(stored);
  }

  const state = await loadState(namespace);

  if (state?.verifiedState || (state?.vaultId && !state.creationPending))
    throw new EnvdenError("LOCKED", "Vault keys unavailable");

  const keys = generateDeviceKeys();

  const record = {
    id: deviceId(keys),
    name,
    encPub: keys.encPub,
    objPub: keys.objPub,
    reqPub: keys.reqPub,
  };

  await keychain.set(slot, identityBytes(keys, record));

  return { keys: { encSk: keys.encSk, objSk: keys.objSk, reqSk: keys.reqSk }, record };
}

export type TDeviceIdentity = Awaited<ReturnType<typeof deviceIdentity>>;

export function deviceIdentity(...args: Parameters<typeof lockeddeviceIdentity>) {
  return withStateLock(args[1], () => lockeddeviceIdentity(...args));
}
