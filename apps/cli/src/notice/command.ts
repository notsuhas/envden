import { sep, resolve } from "node:path";
import type { TAdapters } from "../adapters.ts";
import type { TFetch } from "../client/fetch.ts";
import { loadState, saveState } from "../state/repository.ts";
import { checkRelease } from "../updates/check.ts";
import { releaseConfig } from "../updates/release-config.ts";
import { readConfig } from "../settings/config.ts";
import { updateCheckEnabled } from "../settings/privacy.ts";
import { refreshNotice, noticeStatus } from "./cache.ts";
import { readRemoteNotice, remoteNotice } from "./remote.ts";

export async function commandNotice(
  adapters: TAdapters,
  now: number,
  fetcher: TFetch,
  refresh = false,
  cwd?: string,
) {
  const state = await loadState(adapters.home);
  if (!state) return { repos: [], update: { available: false, required: false } };
  const config = await readConfig(adapters.home);
  const configured = state.updateCheck;

  if (!refresh) {
    state.updateCheck = updateCheckEnabled(config["update-check"] && state.updateCheck);
    await checkRelease(state, releaseConfig.trust, now, fetcher);
    state.updateCheck = configured;
    await saveState(adapters.home, state);
  }

  let remote = await readRemoteNotice(adapters.home);

  if (refresh && state.checkpoint && (!remote || now - remote.checkedAt >= 60000)) {
    try {
      remote = await remoteNotice(adapters, { now: () => now, fetcher, all: true });
    } catch {
      remote = undefined;
    }
  }

  await refreshNotice(adapters.home, state);
  const local = await noticeStatus(adapters.home, state);

  const current = cwd
    ? state.approved.find(
        (item) => resolve(cwd) === item.root || resolve(cwd).startsWith(item.root + sep),
      )
    : undefined;

  const currentRepo = current && (state.aliases[current.repoId] ?? current.repoId);

  return {
    repos: [...new Set([...local.map((item) => item.repoId), ...(remote?.repos ?? [])])].filter(
      (repo) => repo !== currentRepo,
    ),
    update: {
      available: !!state.latest && state.latest !== "0.0.0",
      required:
        (state.release?.unsafe.includes("0.0.0") ?? false) && config["allow-version"] !== "0.0.0",
    },
  };
}
