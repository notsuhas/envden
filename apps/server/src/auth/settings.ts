import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";

export function setUnlockPeriod(options: IAppOptions, auth: IAuth, period: number | null) {
  const vault = options.storage.vault(auth.request.vaultId);
  if (!vault) throw new EnvdenError("NOT_FOUND", "Unknown vault");

  options.storage.configureVault(auth.request.vaultId, { ...vault, unlockPeriod: period });

  return { period };
}
