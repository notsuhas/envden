import { TransferResponseSchema } from "@envden/core/protocol";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { requireMove } from "./session.ts";

export function importPeriod(options: IAppOptions, auth: IAuth, period: number | null) {
  requireMove(options, auth);
  const id = auth.request.vaultId;
  options.storage.configureVault(id, { ...options.storage.vault(id)!, unlockPeriod: period });

  return TransferResponseSchema.parse({ kind: "updated" });
}
