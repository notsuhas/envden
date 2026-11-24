import { verifyTokenProof } from "@envden/core/protocol";
import type { IAppOptions, IAuth } from "../http/types.ts";

export function hasProof(options: IAppOptions, auth: IAuth, kind: "setup" | "repair"): boolean {
  const { storage } = options;
  const { request, proof } = auth;
  if (!proof) return false;

  const key =
    kind === "setup"
      ? storage.setupToken()
      : storage.vault(request.vaultId)?.restored?.repairTokenHash;

  if (kind === "setup" && storage.hasVault(request.vaultId)) return false;

  return !!key && verifyTokenProof(kind, key, request, proof).ok;
}
