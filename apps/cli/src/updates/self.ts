import { basename } from "node:path";
import { restoreReleases, rememberRelease } from "./persistence.ts";
import { selfUpdateDecision } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import type { TFetch } from "../client/fetch.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { loadState, saveState } from "../state/store/repository.ts";
import { emptyState } from "../state/model.ts";
import { postInstall, managerUpdate } from "./self/execute.ts";
import { currentReleasePlatform } from "./self/platform.ts";
import { VERSION } from "../version.ts";
import { checkRelease } from "./check.ts";
import { releaseConfig } from "./release-config.ts";
import { installMethod } from "./install.ts";
import { replaceBinary } from "./replace.ts";

export async function selfUpdate(
  adapters: TAdapters,
  options: {
    now: number;
    fetcher: TFetch;
    binary: string;
    confirm?: (command: string) => Promise<boolean>;
    run?: (command: string[]) => Promise<void>;
  },
) {
  const method = await installMethod(adapters.home, undefined, options.binary);

  if (method.kind === "manager")
    return managerUpdate(method.command, options.binary, options.confirm, options.run);

  await withStateLock(adapters.home, async () => {
    if (["bun", "node", "bun.exe", "node.exe"].includes(basename(options.binary)))
      throw new EnvdenError("INVALID_INPUT", "Self-update requires the installed envden binary");

    const { state, result, buildUrl } = await authorizedRelease(adapters, options);

    const platform = currentReleasePlatform();

    const response = await options.fetcher(buildUrl(result.latest, platform), {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) throw new EnvdenError("INVALID_DATA", "Build download failed");
    const bytes = new Uint8Array(await response.arrayBuffer());

    const decision = selfUpdateDecision(
      result.release,
      VERSION,
      platform,
      state.release?.unsafe ?? [],
      BigInt(options.now),
      bytes,
    );

    if (!decision.ok)
      throw new EnvdenError("INVALID_DATA", "Build is not authorized for self-update");

    await replaceBinary(options.binary, bytes, process.platform === "win32");
  });

  await postInstall(options.binary, options.run);

  return { kind: "updated" as const };
}

async function authorizedRelease(adapters: TAdapters, options: Parameters<typeof selfUpdate>[1]) {
  const existing = await loadState(adapters.home);
  const state = existing ?? emptyState("device");
  const stored = await restoreReleases(adapters.home, releaseConfig.trust, options.now);
  if (stored) state.release = stored;

  const result = await checkRelease(state, releaseConfig.trust, options.now, options.fetcher, true);

  if (result.kind === "checked") await rememberRelease(adapters.home, result.feed);
  if (existing) await saveState(adapters.home, state);

  if (result.kind !== "checked" || result.expired || !releaseConfig.buildUrl)
    throw new EnvdenError(
      "INVALID_DATA",
      "Cannot authorize self-update from the signed release feed",
    );

  return { state, result, buildUrl: releaseConfig.buildUrl };
}
