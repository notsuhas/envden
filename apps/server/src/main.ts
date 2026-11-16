import { millisecondsInHour, millisecondsInMinute } from "date-fns/constants";
import { maxRequestBodySize } from "./middleware/body.ts";
import { base32 } from "@envden/core/protocol";
import { homedir } from "node:os";
import { join } from "node:path";
import { restoreNotice, startRestored } from "./repair/start.ts";
import { pruneHistorySafely } from "./vault/prune.ts";
import { createApp } from "./app.ts";
import { createAdapters } from "./adapters.ts";
import { createStatusState } from "./status/state.ts";
import { systemScheduler, type IScheduler } from "./lifecycle/scheduler.ts";
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
    scheduler?: IScheduler;
    listen?: (app: ReturnType<typeof createApp>) => {
      url: URL;
      stop: (close?: boolean) => void | Promise<void>;
    };
  } = {},
) {
  const dataDir = options.dataDir ?? join(homedir(), ".envden", "server");
  const now = options.now ?? Date.now;
  const serverKeys = await loadServerKeys(dataDir);
  const { storage } = createAdapters(dataDir, now());

  try {
    const token = initializeSetup(storage, serverKeys.publicKey, options.setupToken);

    if (token)
      printToken("Setup token. Paste it when `envden setup` or `envden server move` asks:", token);

    const appOptions = {
      storage,
      now,
      serverKeys,
      config: { appVersion: metadata.version, minClient: options.minClient ?? "0.0.0" },
    };

    if (options.restored)
      for (const repair of startRestored(appOptions))
        if (repair.token)
          printToken(
            `Repair token for vault ${base32(repair.vaultId)}. Paste it when \`envden server repair\` asks:`,
            repair.token,
          );
        else console.log(`Vault ${base32(repair.vaultId)} ${restoreNotice[repair.kind]}`);

    const status = createStatusState(now(), process.env);
    const app = createApp(appOptions, undefined, status);

    const prune = () => {
      status.lastPrune = { at: now(), ok: pruneHistorySafely(appOptions) };
    };

    const server =
      options.listen?.(app) ??
      Bun.serve({
        maxRequestBodySize,
        hostname: "127.0.0.1",
        port: options.port ?? 4280,
        fetch: app.fetch,
      });

    const scheduler = options.scheduler ?? systemScheduler;

    const jobs = [
      scheduler.after(millisecondsInMinute, prune),
      scheduler.every(millisecondsInHour, prune),
    ];

    let stopping = false;

    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      for (const cancel of jobs) cancel();
      process.off("SIGTERM", shutdown);
      process.off("SIGINT", shutdown);
      await server.stop();
      storage.close();
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    console.log(`envden listening on ${server.url.toString()}`);

    return { server, storage, shutdown };
  } catch (error) {
    storage.close();
    throw error;
  }
}

if (import.meta.main) await serve();

function printToken(label: string, token: string) {
  console.log(label);
  console.log(`  ${token}`);
}
