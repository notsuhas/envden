import { base32 } from "@envden/core/protocol";
import { homedir } from "node:os";
import { join } from "node:path";
import { startRestored } from "./repair/start.ts";
import { pruneHistory } from "./vault/prune.ts";
import { createApp } from "./app.ts";
import { createAdapters } from "./adapters.ts";
import { loadServerKeys } from "./identity/keys.ts";
import { initializeSetup } from "./identity/setup.ts";
import metadata from "../package.json";

export async function serve(
  options: {
    dataDir?: string;
    port?: number;
    minClient?: string;
    setupToken?: string;
    restored?: boolean;
  } = {},
) {
  const dataDir = options.dataDir ?? join(homedir(), ".envden", "server");
  const now = () => Date.now();
  const serverKeys = await loadServerKeys(dataDir);
  const { storage } = createAdapters(dataDir, now());

  try {
    const token = initializeSetup(storage, serverKeys.publicKey, options.setupToken);
    if (token) console.log(token);

    const appOptions = {
      storage,
      now,
      serverKeys,
      config: { appVersion: metadata.version, minClient: options.minClient ?? "0.0.0" },
    };

    if (options.restored)
      for (const repair of startRestored(appOptions))
        console.log(base32(repair.vaultId), repair.token);

    const app = createApp(appOptions);
    const pruning = setInterval(() => pruneHistory(appOptions), 3600000);
    pruning.unref();

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: options.port ?? 4280,
      fetch: app.fetch,
    });

    console.log(`envden listening on ${server.url.toString()}`);

    return { server, storage, stopPruning: () => clearInterval(pruning) };
  } catch (error) {
    storage.close();
    throw error;
  }
}

if (import.meta.main) await serve();
