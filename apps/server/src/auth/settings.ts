import { membership } from "../vault/chain.ts";
import { requireGate } from "../middleware/gates.ts";
import { UnlockPeriodSchema } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";

export function setUnlockPeriod(options: IAppOptions, auth: IAuth, period: number | null) {
  options.storage.transaction(() => {
    const vault = options.storage.vault(auth.request.vaultId);
    if (!vault) throw new EnvdenError("NOT_FOUND", "Unknown vault");

    auth = {
      ...auth,
      member: !!membership(options.storage, auth.request.vaultId, auth.request.device),
    };

    requireGate(options, auth, "fresh");
    options.storage.configureVault(auth.request.vaultId, { ...vault, unlockPeriod: period });
    if (period !== null) options.storage.capUnlocks(auth.request.vaultId, options.now() + period);
  });

  return UnlockPeriodSchema.parse({ period });
}
