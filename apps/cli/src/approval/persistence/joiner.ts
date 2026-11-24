import { join } from "node:path";
import { z } from "zod";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";

const JoinerSchema = z
  .object({
    number: z.number().int().min(1).max(999),
    vaultId: z.string(),
    pin: z.string(),
    expiresAt: z.number().int(),
  })
  .strict();

export type TJoiner = z.infer<typeof JoinerSchema>;

function joinerPath(adapters: TAdapters) {
  return join(adapters.home, "state", "join-request");
}

// Saved once the user confirms the words, so join --resume can collect an approval made later.
export function saveJoiner(adapters: TAdapters, joiner: TJoiner) {
  return atomicWrite(joinerPath(adapters), JSON.stringify(joiner), adapters.now);
}

export async function readJoiner(adapters: TAdapters): Promise<TJoiner> {
  const saved = await optionalRead(joinerPath(adapters));
  if (saved === undefined) throw new EnvdenError("NOT_FOUND", "No join to resume");
  const parsed = JoinerSchema.safeParse(JSON.parse(saved));
  if (!parsed.success) throw new EnvdenError("INVALID_DATA", "Invalid stored join request");

  return parsed.data;
}
