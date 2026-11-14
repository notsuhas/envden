import { restoreReleases, rememberRelease } from "./persistence.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { readConfig } from "../settings/config.ts";
import { updateCheckEnabled } from "../settings/privacy.ts";
import type { TAdapters } from "../adapters.ts";
import { loadState, saveState } from "../state/store/repository.ts";
import { emptyState } from "../state/model.ts";
import { releaseConfig } from "./release-config.ts";
import { checkRelease, releaseCheckSummary } from "./check.ts";

async function lockedrunUpdateCheck(adapters: TAdapters, now: number, force = true) {
  const existing = await loadState(adapters.home);
  const state = existing ?? emptyState("device");
  const stored = await restoreReleases(adapters.home, releaseConfig.trust, now);
  if (stored) state.release = stored;
  const config = await readConfig(adapters.home);
  if (!updateCheckEnabled(config["update-check"])) return { kind: "skipped" as const };
  const result = await checkRelease(state, releaseConfig.trust, now, fetch, force);
  if (result.kind === "checked") await rememberRelease(adapters.home, result.feed, state.release);
  if (existing) await saveState(adapters.home, state);

  return releaseCheckSummary(result);
}

export function runUpdateCheck(...args: Parameters<typeof lockedrunUpdateCheck>) {
  return withStateLock(args[0].home, () => lockedrunUpdateCheck(...args));
}
