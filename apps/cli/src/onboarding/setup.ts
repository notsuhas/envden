import { addressProblem, requireServerAddress, type TShell } from "./decisions.ts";
import * as p from "@envden/core/protocol";
import type { TFetch } from "../client/fetch.ts";
import { hello } from "../client/hello.ts";
import { MIN_SERVER } from "../version.ts";
import { readToken } from "../output/prompts/token.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { parseKit, secretKeyProblem } from "../vault/recovery/input.ts";
import { writeKit } from "../vault/recovery/output.ts";
import { printKitSaved } from "../output/render/devices/kit.ts";
import { reportKit } from "../vault/recovery/pdf/report.ts";
import type { ISetupKit } from "../vault/recovery/pending-kit.ts";
import { confirmedPassword } from "./password.ts";
import { askDeviceName } from "../output/prompts/device-name.ts";
import { setupCheckouts } from "./scan.ts";
import { setupPreferences, updatePreferences } from "./preferences.ts";
import type { TAdapters } from "../adapters.ts";
import { EnvdenError } from "@envden/core/errors";
import { pushInitialFiles } from "../vault/initial/push.ts";
import { setupVault } from "../vault/setup.ts";
import { optionalRead } from "../state/store/files.ts";
import { loadState, saveState } from "../state/store/repository.ts";
import { refreshNotice } from "../notice/cache.ts";
import { secret, input, consent } from "../output/prompts/questions.ts";
import type { ILocalState } from "../state/model.ts";

interface ISetupOptions {
  server?: string;
  setupToken?: string;
  name?: string;
  yes?: boolean;
  hostServer?: boolean;
  kitOut?: string;
  telemetry?: "on" | "off";
  updateCheck?: "on" | "off";
  agent?: "on" | "off";
  shell?: TShell | "none";
  scanRoot?: string[];
  excludeRoot?: string[];
}

async function lockedrunSetup(
  adapters: TAdapters,
  options: ISetupOptions,
  now: () => number,
): Promise<ILocalState> {
  const existing = await loadState(adapters.home);

  let state;

  if (existing?.vaultId && !existing.creationPending) {
    if (options.hostServer) await adapters.hostServer();
    state = existing;

    await updatePreferences(adapters, options);
  } else state = await createState(adapters, options, now, existing?.vaultId);

  await setupCheckouts(adapters, state, { ...options, now });
  await pushInitialFiles(adapters, state, now);

  await refreshNotice(
    adapters.home,
    state,
    (root) => adapters.repo.caseInsensitive(root, true),
    adapters.now,
  );

  return state;
}

async function createState(
  adapters: TAdapters,
  options: ISetupOptions,
  now: () => number,
  vaultId?: string,
) {
  const hosted = await hostLocally(adapters, options);

  const address = requireServerAddress(
    options.server ??
      hosted?.address ??
      (await input("Server address", true, undefined, addressProblem)),
  );

  const token = hosted?.token ?? (await readToken("setup", options.setupToken));
  if (!hosted) await checkServer(address, token, adapters.fetcher);

  const name = await askDeviceName(options.name, adapters.hostname);
  const password = await confirmedPassword(secret);

  const result = await setupVault(adapters, {
    address,
    token,
    name,
    password,
    now,
    fetcher: adapters.fetcher,
    readResumeSecretKey: () => resumeKey(vaultId, options.kitOut),
    onKit: (kit) => reportSetupKit(adapters, options.kitOut, name, now, kit),
  });

  await setupPreferences(adapters, options);

  await saveState(adapters.home, result.state, adapters.now);

  return result.state;
}

export function runSetup(...args: Parameters<typeof lockedrunSetup>) {
  return withStateLock(args[0].home, () => lockedrunSetup(...args));
}

async function resumeKey(vaultId: string | undefined, kitOut: string | undefined) {
  if (!vaultId) return undefined;

  if (kitOut) {
    const saved = await optionalRead(kitOut);

    return saved === undefined ? undefined : parseKit(saved).secretKey;
  }

  if (
    !(await consent("Setup stopped after giving you a recovery kit. Do you still have it?", true))
  )
    return undefined;

  return (await secret("Secret key from that kit (EK1-…)", secretKeyProblem)).trim();
}

// Runs before the name and password questions, so a wrong address or token fails fast.
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

async function hostLocally(adapters: TAdapters, options: ISetupOptions) {
  const https = await adapters.network.checkHttpsCertificate();
  if (https.kind !== "ready") throw new EnvdenError("INVALID_INPUT", https.message);

  const host =
    options.hostServer ||
    (!options.server &&
      process.stdin.isTTY &&
      (await consent("Host the server on this machine? An always-on host is recommended.")));

  if (!host) return undefined;

  const token = options.setupToken === undefined ? await adapters.localSetupToken() : undefined;
  await adapters.hostServer();
  console.log("Server installed on this machine");

  return { address: await adapters.network.expose(4783), token };
}

// --kit-out is the scripted path, so it writes only the JSON that join --recovery-kit reads.
async function reportSetupKit(
  adapters: TAdapters,
  path: string | undefined,
  deviceName: string,
  now: () => number,
  kit: ISetupKit,
) {
  if (!path) return reportKit(kit, { userHome: adapters.userHome, deviceName, now: now() });

  await writeKit(path, kit);
  printKitSaved(path, "json");
}
