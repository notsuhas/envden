import { withStateLock } from "../state/lock/lock.ts";
import { readConfig } from "../settings/config.ts";
import { updateCheckEnabled } from "../settings/privacy.ts";
import type { TAdapters } from "../adapters.ts";
import type { TFetch } from "../client/fetch.ts";
import { checkRelease } from "./check.ts";
import { readUpdateCache, saveUpdateCache } from "./cache.ts";

export function runUpdateCheck(
  adapters: TAdapters,
  now: number,
  force = true,
  fetcher: TFetch = adapters.fetcher,
) {
  return withStateLock(adapters.home, async () => {
    const config = await readConfig(adapters.home);
    if (!updateCheckEnabled(config["update-check"])) return { kind: "skipped" as const };
    const state = await readUpdateCache(adapters.home);
    const result = await checkRelease(state, now, fetcher, force);
    await saveUpdateCache(adapters.home, state);

    return result;
  });
}
