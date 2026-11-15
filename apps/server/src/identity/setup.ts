import {
  randomBytes,
  serverPin,
  tokenKey,
  encodeToken,
  decodeToken,
  equal,
} from "@envden/core/protocol";
import type { IStorageAdapter } from "@envden/core/adapters";
import { EnvdenError } from "@envden/core/errors";

export function initializeSetup(
  storage: IStorageAdapter,
  publicKey: Uint8Array,
  replacement?: string,
): string | undefined {
  const pin = serverPin(publicKey);
  const namespace = new Uint8Array(32);
  const key = new Uint8Array();

  if (
    !replacement &&
    (storage.setupToken() ||
      storage.state(namespace, "setup-issued", key) ||
      storage.vaultIds().length > 0)
  )
    return undefined;

  const secret = replacement ? decodeToken("setup", replacement).secret : randomBytes(20);

  if (replacement && !equal(decodeToken("setup", replacement).serverPin, pin))
    throw new EnvdenError("INVALID_INPUT", "Setup token pin mismatch");

  storage.transaction(() => {
    storage.setSetupToken(tokenKey("setup", secret));
    storage.writeState(namespace, [{ kind: "setup-issued", key, bytes: new Uint8Array([1]) }]);
  });

  return encodeToken("setup", secret, pin);
}

export function reissueSetup(storage: IStorageAdapter, publicKey: Uint8Array): string | undefined {
  if (storage.vaultIds().length > 0) return undefined;

  return initializeSetup(
    storage,
    publicKey,
    encodeToken("setup", randomBytes(20), serverPin(publicKey)),
  );
}
