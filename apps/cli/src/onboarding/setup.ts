import { withStateLock } from "../state/lock.ts";
import { parseKit } from "../vault/recovery/input.ts";
import { writeKit } from "../vault/recovery/output.ts";
import { confirmedPassword } from "./password.ts";
import { defaultInput } from "../output/default-input.ts";
import { setupCheckouts } from "./scan.ts";
import { setupPreferences } from "./preferences.ts";
import type { TAdapters } from "../adapters.ts";
import { EnvdenError } from "@envden/core/errors";
import { pushInitialFiles } from "../vault/initial/push.ts";
import { setupVault } from "../vault/setup.ts";
import { readFile } from "node:fs/promises";
import { loadState, saveState } from "../state/repository.ts";
import { refreshNotice } from "../notice/cache.ts";
import { secret, input } from "../output/questions.ts";

interface ISetupOptions {
  server?: string;
  setupToken?: string;
  name?: string;
  yes?: boolean;
  hostServer?: boolean;
  kitOut?: string;
  telemetry?: string;
  updateCheck?: string;
  agent?: string;
  shell?: string;
  scanRoot?: string[];
  excludeRoot?: string[];
}

async function lockedrunSetup(
  adapters: TAdapters,
  options: ISetupOptions,
  now: () => number,
): Promise<void> {
  if (!(await adapters.network.checkHttpsCertificate()))
    throw new EnvdenError("INVALID_INPUT", "Enable Tailscale HTTPS certificates before setup");

  let hostedAddress: string | undefined;

  if (options.hostServer) {
    const installed = await adapters.hostServer();
    console.log(`Server installed. Read its setup token from ${installed.log}`);
    hostedAddress = await adapters.network.expose(4783);
  }

  const address = options.server ?? hostedAddress ?? (await input("Server URL"));
  const token = options.setupToken ?? (await secret("Server setup token"));
  const name = await defaultInput(options.name, "Device name");
  const password = await confirmedPassword(secret);

  const existing = await loadState(adapters.home);

  const resumeSecretKey = await resumeKey(existing?.vaultId, options.kitOut);

  const reportKit = async (kit: unknown) => {
    if (options.kitOut) await writeKit(options.kitOut, kit);
    else console.log(JSON.stringify(kit, null, 2));
  };

  const result = await setupVault(adapters, {
    address,
    token,
    name,
    password,
    now,
    fetcher: fetch,
    ...(resumeSecretKey ? { resumeSecretKey } : {}),
    onKit: reportKit,
  });

  console.log(
    "Store this recovery kit like a passport. Writing the password on it gives it full vault access.",
  );

  await setupPreferences(adapters, result.state, options);

  await saveState(adapters.home, result.state);

  await setupCheckouts(adapters, result.state, options);

  await pushInitialFiles(adapters, result.state, now);
  await refreshNotice(adapters.home, result.state);
}

export function runSetup(...args: Parameters<typeof lockedrunSetup>) {
  return withStateLock(args[0].home, () => lockedrunSetup(...args));
}

async function resumeKey(vaultId: string | undefined, kitOut: string | undefined) {
  if (!vaultId) return undefined;
  if (kitOut) return parseKit(JSON.parse(await readFile(kitOut, "utf8"))).secretKey;

  return secret("Recovery secret key issued before creation");
}
