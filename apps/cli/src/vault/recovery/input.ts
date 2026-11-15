import { z } from "zod";
import { EnvdenError } from "@envden/core/errors";

const kitSchema = z.object({ vaultId: z.string(), secretKey: z.string() });

export function parseKit(kit: unknown) {
  const result = kitSchema.safeParse(kit);
  if (!result.success) throw new EnvdenError("INVALID_INPUT", "Invalid recovery kit");

  return result.data;
}
