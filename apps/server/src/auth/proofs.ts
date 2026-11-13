import { repairLoginDecision } from "@envden/core/chain";
import { repairHistory } from "../repair/close.ts";
import { requireMove } from "../move/session.ts";
import { EnvdenError } from "@envden/core/errors";
import { hasProof } from "./token.ts";
import type { IAppOptions, IAuth } from "../http/types.ts";

export function authorizeRegistration(options: IAppOptions, auth: IAuth): void {
  if (options.storage.vault(auth.request.vaultId)?.active === false) {
    requireMove(options, auth);

    return;
  }

  if (
    options.storage.vault(auth.request.vaultId)?.restored &&
    repairLoginDecision(repairHistory(options, auth.request.vaultId)) !== "register"
  )
    throw new EnvdenError("UNAUTHORIZED", "Repair login required");

  const state = options.storage.device(auth.request.vaultId, auth.request.device);
  const fresh = auth.member && !!state && options.now() < state.freshUntil;

  if (
    !fresh &&
    !hasProof(options, auth, "setup") &&
    !(auth.member && hasProof(options, auth, "sk")) &&
    !(auth.member && hasProof(options, auth, "repair"))
  ) {
    throw new EnvdenError("UNAUTHORIZED", "Proof required");
  }
}
