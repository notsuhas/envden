import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { TAdapters } from "../../adapters.ts";

export async function clearJoiner(adapters: TAdapters) {
  await adapters.keychain.delete(`envden/${adapters.home}/pair-receive`);

  for (const file of ["pair-pin", "pair-joiner", "pair-expiry"])
    await rm(join(adapters.home, "state", file), { force: true });
}
