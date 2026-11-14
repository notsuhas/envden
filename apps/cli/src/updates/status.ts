import { join } from "node:path";
import { compareSemver } from "@envden/core/protocol";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { readUpdateCache } from "./cache.ts";
import { VERSION } from "../version.ts";

export async function updateStatus(home: string) {
  const cache = await readUpdateCache(home);

  return {
    available: !!cache.latest && compareSemver(cache.latest, VERSION) > 0,
    required: (await optionalRead(join(home, "state", "update-required"))) === VERSION,
    ...(cache.message ? { message: cache.message } : {}),
  };
}

export function recordUpdateRequired(home: string) {
  return atomicWrite(join(home, "state", "update-required"), VERSION);
}
