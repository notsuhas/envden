import { createAdapters } from "../adapters.ts";
import { loadServerKeys } from "./keys.ts";
import { reissueSetup } from "./setup.ts";

export async function localSetupToken(dataDir: string, now: number) {
  const keys = await loadServerKeys(dataDir);
  const { storage } = createAdapters(dataDir, now);

  try {
    return reissueSetup(storage, keys.publicKey);
  } finally {
    storage.close();
  }
}
