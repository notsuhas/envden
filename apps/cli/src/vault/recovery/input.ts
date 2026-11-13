import { EnvdenError } from "@envden/core/errors";

export function parseKit(kit: unknown) {
  if (
    !kit ||
    typeof kit !== "object" ||
    !("vaultId" in kit) ||
    typeof kit.vaultId !== "string" ||
    !("secretKey" in kit) ||
    typeof kit.secretKey !== "string"
  )
    throw new EnvdenError("INVALID_INPUT", "Invalid recovery kit");

  return { vaultId: kit.vaultId, secretKey: kit.secretKey };
}
