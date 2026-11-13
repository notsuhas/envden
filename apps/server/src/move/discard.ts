import type { IAppOptions, IAuth } from "../http/types.ts";
import { requireMove } from "./session.ts";

export function discardMove(options: IAppOptions, auth: IAuth) {
  requireMove(options, auth);
  const vault = auth.request.vaultId;

  options.storage.transaction(() => {
    const token = options.storage.state(vault, "move-session", new TextEncoder().encode("setup"));
    options.storage.discardInactiveVault(vault);
    options.storage.writeState(new Uint8Array(32), [{ kind: "server-identity", key: vault }]);
    if (token) options.storage.setSetupToken(token);
  });

  return { kind: "unfrozen" as const };
}
