import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { hasProof } from "../../auth/token.ts";

export function requireRepair(options: IAppOptions, auth: IAuth) {
  if (!options.storage.vault(auth.request.vaultId)?.restored || !hasProof(options, auth, "repair"))
    throw new EnvdenError("UNAUTHORIZED", "Repair proof required");
}
