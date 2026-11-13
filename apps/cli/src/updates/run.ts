import { readConfig } from "../settings/config.ts";
import { updateCheckEnabled } from "../settings/privacy.ts";
import type { TAdapters } from "../adapters.ts";
import { loadState, saveState } from "../state/repository.ts";
import { emptyState } from "../state/model.ts";
import { releaseConfig } from "./release-config.ts";
import { checkRelease } from "./check.ts";

export async function runUpdateCheck(adapters: TAdapters, now: number, force = true) {
  const state = (await loadState(adapters.home)) ?? emptyState("device");
  const config = await readConfig(adapters.home);
  if (!updateCheckEnabled(config["update-check"])) return { kind: "skipped" as const };
  const result = await checkRelease(state, releaseConfig.trust, now, fetch, force);
  await saveState(adapters.home, state);

  return result;
}
