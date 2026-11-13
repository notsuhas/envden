import { maxRequestBodySize } from "./middleware/body.ts";
import { base32 } from "@envden/core/protocol";
import { homedir } from "node:os";
import { join } from "node:path";
import { startRestored } from "./repair/start.ts";
import { pruneHistorySafely } from "./vault/prune.ts";
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
    now?: () => number;
  } = {},
) {
  const dataDir = options.dataDir ?? join(homedir(), ".envden", "server");
  const now = options.now ?? (() => Date.now());
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

    const pruning = setInterval(() => pruneHistorySafely(appOptions), 3600000);
    pruning.unref();

    const server = Bun.serve({
      maxRequestBodySize,
      hostname: "127.0.0.1",
      port: options.port ?? 4280,
      fetch: app.fetch,
    });

    console.log(`envden listening on ${server.url.toString()}`);

    let stopping = false;

    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      clearInterval(pruning);
      process.off("SIGTERM", shutdown);
      process.off("SIGINT", shutdown);
      await server.stop();
      storage.close();
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    return { server, storage, shutdown, stopPruning: () => clearInterval(pruning) };
  } catch (error) {
    storage.close();
    throw error;
  }
}

if (import.meta.main) await serve();
