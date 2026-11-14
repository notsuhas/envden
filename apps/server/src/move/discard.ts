import type { IAppOptions, IAuth } from "../http/types.ts";
import { requireMove } from "./session.ts";

export function discardMove(options: IAppOptions, auth: IAuth) {
  requireMove(options, auth);
  const vault = auth.request.vaultId;

  options.storage.transaction(() => {
    options.storage.discardInactiveVault(vault);
  });

  return { kind: "unfrozen" as const };
}
