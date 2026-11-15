import { z } from "zod";
import { join } from "node:path";
import { isSemver } from "@envden/core/protocol";
import { atomicWrite, optionalRead } from "../state/store/files.ts";

const updateCacheSchema = z.object({
  checkedAt: z.number().exactOptional(),
  latest: z.string().refine(isSemver).exactOptional(),
  message: z.string().exactOptional(),
});

export type TUpdateCache = z.infer<typeof updateCacheSchema>;

export async function readUpdateCache(home: string): Promise<TUpdateCache> {
  try {
    const value: unknown = JSON.parse(
      (await optionalRead(join(home, "state", "updates.json"))) ?? "{}",
    );

    return updateCacheSchema.safeParse(value).data ?? {};
  } catch {
    return {};
  }
}

export function saveUpdateCache(home: string, cache: TUpdateCache, now: () => number) {
  return atomicWrite(join(home, "state", "updates.json"), JSON.stringify(cache), now);
}
