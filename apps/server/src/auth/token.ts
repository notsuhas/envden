import { verifyTokenProof, verifySKProof } from "@envden/core/protocol";
import type { IAppOptions, IAuth } from "../http/types.ts";

export function hasProof(
  options: IAppOptions,
  auth: IAuth,
  kind: "setup" | "repair" | "sk",
): boolean {
  const { storage } = options;
  const { request, proof } = auth;
  if (!proof) return false;

  if (kind === "sk") {
    const pub = storage.state(request.vaultId, "skPub", new Uint8Array());

    return (
      !storage.vault(request.vaultId)?.skRefused && !!pub && verifySKProof(pub, request, proof).ok
    );
  }

  const key =
    kind === "setup"
      ? storage.setupToken()
      : storage.vault(request.vaultId)?.restored?.repairTokenHash;

  if (kind === "setup" && storage.hasVault(request.vaultId)) return false;

  return !!key && verifyTokenProof(kind, key, request, proof).ok;
}
