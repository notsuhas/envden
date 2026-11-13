import { defaultInput } from "../output/default-input.ts";
import { setupCheckouts } from "./scan.ts";
import { setupPreferences } from "./preferences.ts";
import type { TAdapters } from "../adapters.ts";
import { EnvdenError } from "@envden/core/errors";
import { pushInitialFiles } from "../vault/initial/push.ts";
import { setupVault } from "../vault/setup.ts";
import { saveState } from "../state/repository.ts";
import { refreshNotice } from "../notice/cache.ts";
import { secret, input } from "../output/questions.ts";

interface ISetupOptions {
  server?: string;
  setupToken?: string;
  name?: string;
  yes?: boolean;
  hostServer?: boolean;
  telemetry?: string;
  updateCheck?: string;
  agent?: string;
  shell?: string;
  scanRoot?: string[];
  excludeRoot?: string[];
}

export async function runSetup(
  adapters: TAdapters,
  options: ISetupOptions,
  now: () => number,
): Promise<void> {
  if (options.hostServer)
    throw new EnvdenError(
      "NOT_IMPLEMENTED",
      "Start envden serve, then use --server and --setup-token",
    );

  const address = options.server ?? (await input("Server URL"));
  const token = options.setupToken ?? (await secret("Server setup token"));
  const name = await defaultInput(options.name, "Device name");
  const password = await secret("Master password");

  const result = await setupVault(adapters, {
    address,
    token,
    name,
    password,
    now,
    fetcher: fetch,
  });

  console.log(JSON.stringify(result.kit, null, 2));

  console.log(
    "Store this recovery kit like a passport. Writing the password on it gives it full vault access.",
  );

  await setupPreferences(adapters, result.state, options);

  await saveState(adapters.home, result.state);

  await setupCheckouts(adapters, result.state, options);

  await pushInitialFiles(adapters, result.state, now);
  await refreshNotice(adapters.home, result.state);
}
