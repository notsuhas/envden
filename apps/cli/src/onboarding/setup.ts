import { addressProblem, requireServerAddress, type TShell } from "./decisions.ts";
import * as p from "@envden/core/protocol";
import type { TFetch } from "../client/fetch.ts";
import { hello } from "../client/hello.ts";
import { MIN_SERVER } from "../version.ts";
import { readToken } from "../output/prompts/token.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { recoveryCodeOutput, requireCodeOutput } from "../vault/recovery/show.ts";
import { askDeviceName } from "../output/prompts/device-name.ts";
import { setupCheckouts } from "./scan.ts";
import { setupPreferences, updatePreferences } from "./preferences.ts";
import type { TAdapters } from "../adapters.ts";
import { EnvdenError } from "@envden/core/errors";
import { pushInitialFiles } from "../vault/initial/push.ts";
import { resumeCommittedSetup, setupVault } from "../vault/setup.ts";
import { loadState, saveState } from "../state/store/repository.ts";
import { refreshNotice } from "../notice/cache.ts";
import { input } from "../output/prompts/questions.ts";
import { hostLocally } from "./host/local.ts";
import { rehostServer } from "./host/rehost.ts";
import type { ILocalState } from "../state/model.ts";

interface ISetupOptions {
  server?: string;
  setupToken?: string;
  name?: string;
  yes?: boolean;
  hostServer?: boolean;
  recoveryCodeOut?: string;
  telemetry?: "on" | "off";
  updateCheck?: "on" | "off";
  agent?: "on" | "off";
  shell?: TShell | "none";
  scanRoot?: string[];
  excludeRoot?: string[];
  verbose?: boolean;
}

async function lockedrunSetup(
  adapters: TAdapters,
  options: ISetupOptions,
  now: () => number,
): Promise<ILocalState> {
  const existing = await loadState(adapters.home);

  let state;

  if (existing?.vaultId && !existing.creationPending) {
    if (options.hostServer) await rehostServer(adapters, existing);
    state = existing;

    await updatePreferences(adapters, options);
  } else state = await createState(adapters, options, now);

  await setupCheckouts(adapters, state, { ...options, command: "setup", now });
  await pushInitialFiles(adapters, state, now);

  await refreshNotice(
    adapters.home,
    state,
    (root) => adapters.repo.caseInsensitive(root, true),
    adapters.now,
  );

  return state;
}

async function createState(adapters: TAdapters, options: ISetupOptions, now: () => number) {
  const resumed = await resumeSetup(adapters, options, now);
  if (resumed) return resumed;
  const hosted = await hostLocally(adapters, options);

  const address = requireServerAddress(
    options.server ??
      hosted?.address ??
      (await input("Server address", true, undefined, addressProblem)),
  );

  const token = hosted?.token ?? (await readToken("setup", options.setupToken));
  if (!hosted) await checkServer(address, token, adapters.fetcher);
  const output = { path: options.recoveryCodeOut };
  requireCodeOutput(output);

  const name = await askDeviceName(options.name, adapters.hostname);

  const result = await setupVault(adapters, {
    address,
    token,
    name,
    now,
    fetcher: adapters.fetcher,
    onCode: recoveryCodeOutput(output).show,
  });

  await setupPreferences(adapters, options);

  await saveState(adapters.home, result.state, adapters.now);

  return result.state;
}

// A creation that committed before its code reached the user resumes without host, address or token.
async function resumeSetup(adapters: TAdapters, options: ISetupOptions, now: () => number) {
  if (!(await loadState(adapters.home))?.creationPending) return undefined;
  const output = { path: options.recoveryCodeOut };
  requireCodeOutput(output);

  const result = await resumeCommittedSetup(adapters, {
    now,
    fetcher: adapters.fetcher,
    onCode: recoveryCodeOutput(output).show,
  });

  if (!result) return undefined;
  await setupPreferences(adapters, options);
  await saveState(adapters.home, result.state, adapters.now);

  return result.state;
}

export function runSetup(...args: Parameters<typeof lockedrunSetup>) {
  return withStateLock(args[0].home, () => lockedrunSetup(...args));
}

// Runs before the name question, so a wrong address or token fails fast.
async function checkServer(address: string, token: string, fetcher: TFetch) {
  const server = await hello(address, undefined, fetcher, MIN_SERVER).catch((cause: unknown) => {
    if (cause instanceof EnvdenError && ["SERVER_TOO_OLD", "UPDATE_REQUIRED"].includes(cause.code))
      throw cause;

    throw new EnvdenError(
      "SERVER_UNREACHABLE",
      `Can't reach ${address}. Check the address and that the server is running`,
      { cause },
    );
  });

  if (!p.equal(server.pin, p.decodeToken("setup", token).serverPin))
    throw new EnvdenError("INVALID_INPUT", "This setup token is for a different server");
}
