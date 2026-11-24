import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { TAdapters } from "../../adapters.ts";

export async function clearJoiner(adapters: TAdapters) {
  await rm(join(adapters.home, "state", "join-request"), { force: true });
}
