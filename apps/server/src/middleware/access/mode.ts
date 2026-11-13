import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { hasProof } from "../../auth/token.ts";

export function verifyVaultMode(options: IAppOptions, auth: IAuth, pathname: string) {
  const { storage } = options;
  const request = auth.request;

  if (storage.vault(request.vaultId)?.restored && !hasProof(options, auth, "repair"))
    throw new EnvdenError("RESTORED_MODE", "Repair required");

  const vault = storage.vault(request.vaultId);

  if (
    vault?.restored &&
    !/^\/v1\/(repair\/|swap$|blobs(?:\/|$)|headers$|entries$|head$|files\/|keyrings\/|envelope$|opaque\/)/.test(
      pathname,
    )
  )
    throw new EnvdenError("RESTORED_MODE", "Repair required");

  if (
    vault?.active === false &&
    !/^\/v1\/(move\/|swap$|blobs\/|opaque\/registration\/)/.test(pathname)
  )
    throw new EnvdenError("MOVING", "Vault moving");
}
