import { readToken } from "../output/token.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { parseKit } from "../vault/recovery/input.ts";
import { writeKit } from "../vault/recovery/output.ts";
import { confirmedPassword } from "./password.ts";
import { defaultInput } from "../output/default-input.ts";
import { setupCheckouts } from "./scan.ts";
import { setupPreferences, updatePreferences } from "./preferences.ts";
import type { TAdapters } from "../adapters.ts";
import { EnvdenError } from "@envden/core/errors";
import { pushInitialFiles } from "../vault/initial/push.ts";
import { setupVault } from "../vault/setup.ts";
import { readFile } from "node:fs/promises";
import { loadState, saveState } from "../state/store/repository.ts";
import { refreshNotice } from "../notice/cache.ts";
import { secret, input, consent } from "../output/questions.ts";

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
  const existing = await loadState(adapters.home);

  let state;

  if (existing?.vaultId && !existing.creationPending) {
    if (options.hostServer) await adapters.hostServer();
    state = existing;

    await updatePreferences(adapters, options);
  } else state = await createState(adapters, options, now, existing?.vaultId);

  await setupCheckouts(adapters, state, { ...options, now });
  await pushInitialFiles(adapters, state, now);
  await refreshNotice(adapters.home, state);
}

async function createState(
  adapters: TAdapters,
  options: ISetupOptions,
  now: () => number,
  vaultId?: string,
) {
  const hostedAddress = await hostAddress(adapters, options);

  const address = options.server ?? hostedAddress ?? (await input("Server URL"));
  const token = await readToken(options.setupToken, "Server setup token");
  const name = await defaultInput(options.name, "Device name");
  const password = await confirmedPassword(secret);

  const resumeSecretKey = await resumeKey(vaultId, options.kitOut);

  const result = await setupVault(adapters, {
    address,
    token,
    name,
    password,
    now,
    fetcher: adapters.fetcher,
    ...(resumeSecretKey ? { resumeSecretKey } : {}),
    onKit: (kit) => reportKit(options.kitOut, kit),
  });

  console.log(
    "Store this recovery kit like a passport. Writing the password on it gives it full vault access.",
  );

  await setupPreferences(adapters, options);

  await saveState(adapters.home, result.state);

  return result.state;
}

export function runSetup(...args: Parameters<typeof lockedrunSetup>) {
  return withStateLock(args[0].home, () => lockedrunSetup(...args));
}

async function resumeKey(vaultId: string | undefined, kitOut: string | undefined) {
  if (!vaultId) return undefined;
  if (kitOut) return parseKit(JSON.parse(await readFile(kitOut, "utf8"))).secretKey;

  return secret("Recovery secret key issued before creation");
}

async function hostAddress(adapters: TAdapters, options: ISetupOptions) {
  if (!(await adapters.network.checkHttpsCertificate()))
    throw new EnvdenError("INVALID_INPUT", "Enable Tailscale HTTPS certificates before setup");

  const host =
    options.hostServer ||
    (!options.server &&
      process.stdin.isTTY &&
      (await consent("Host the server on this machine? An always-on host is recommended.")));

  if (!host) return undefined;
  const installed = await adapters.hostServer();
  console.log(`Server installed. Read its setup token from ${installed.log}`);

  return adapters.network.expose(4783);
}

async function reportKit(path: string | undefined, kit: unknown) {
  if (path) await writeKit(path, kit);
  else console.log(JSON.stringify(kit, null, 2));
}
