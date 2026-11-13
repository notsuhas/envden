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
  const identityVault = new Uint8Array(32);
  const issuedKey = new TextEncoder().encode("setup-issued");

  if (!replacement && storage.setupToken()) return undefined;

  const secret = replacement ? decodeToken("setup", replacement).secret : randomBytes(20);

  if (replacement && !equal(decodeToken("setup", replacement).serverPin, pin))
    throw new EnvdenError("INVALID_INPUT", "Setup token pin mismatch");

  storage.transaction(() => {
    storage.setSetupToken(tokenKey("setup", secret));

    storage.writeState(identityVault, [
      { kind: "server-identity", key: issuedKey, bytes: new Uint8Array([1]) },
    ]);
  });

  return encodeToken("setup", secret, pin);
}
