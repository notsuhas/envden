import { reportPendingJoins } from "./pending.ts";
import { boundedFetch } from "./fetch.ts";
import { cacheOffers } from "./offers.ts";
import { compareSemver } from "@envden/core/protocol";
import { rememberRelease, restoreReleases } from "../updates/persistence.ts";
import { cleanupOldBinary } from "../updates/replace.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { sanitizeTerminal } from "../output/sanitize.ts";
import { sep, resolve } from "node:path";
import type { TAdapters } from "../adapters.ts";
import type { TFetch } from "../client/fetch.ts";
import { loadState, saveState } from "../state/store/repository.ts";
import { checkRelease } from "../updates/check.ts";
import { releaseConfig } from "../updates/release-config.ts";
import { readConfig } from "../settings/config.ts";
import { updateCheckEnabled } from "../settings/privacy.ts";
import { refreshNotice, noticeStatus } from "./cache.ts";
import { readRemoteNotice, remoteNotice } from "./remote.ts";
import { VERSION } from "../version.ts";

async function lockedcommandNotice(
  adapters: TAdapters,
  now: number,
  fetcher: TFetch,
  refresh = false,
  cwd?: string,
  localOnly = false,
) {
  await cleanupOldBinary(process.execPath, process.platform === "win32");
  const state = await loadState(adapters.home);
  if (!state) return { repos: [], update: { available: false, required: false } };
  const stored = await restoreReleases(adapters.home, releaseConfig.trust, now);
  if (stored) state.release = stored;
  const config = await readConfig(adapters.home);

  if (!refresh && !localOnly) await refreshRelease(adapters, state, now, fetcher);

  if (!refresh) await reportPendingJoins(adapters.home);
  const remote = await readRemoteNotice(adapters.home);

  await refreshNotice(adapters.home, state);
  await cacheOffers(adapters, state, cwd, updateNotice(state, config));
  const local = await noticeStatus(adapters.home, state);

  const currentRepo = currentRepoId(state, cwd);

  return {
    repos: [...new Set([...local.map((item) => item.repoId), ...(remote?.repos ?? [])])]
      .filter((repo) => repo !== currentRepo)
      .map(sanitizeTerminal),
    update: updateNotice(state, config),
  };
}

export async function commandNotice(
  adapters: TAdapters,
  now: number,
  fetcher: TFetch,
  refresh = false,
  cwd?: string,
  localOnly = false,
) {
  const fetchNotice = boundedFetch(fetcher);

  try {
    if (!refresh) {
      await withStateLock(adapters.home, () => reportPendingJoins(adapters.home));
    }

    if (!localOnly) {
      const state = await loadState(adapters.home);
      if (state) await refreshedRemote(adapters, state, now, fetchNotice, !refresh);
    }

    return await withStateLock(adapters.home, () =>
      lockedcommandNotice(adapters, now, fetchNotice, refresh, cwd, localOnly),
    );
  } catch {
    return { repos: [], update: { available: false, required: false } };
  }
}

async function refreshedRemote(
  adapters: TAdapters,
  state: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  now: number,
  fetcher: TFetch,
  force: boolean,
) {
  let remote = await readRemoteNotice(adapters.home);

  if (state.checkpoint && (force || !remote || now - remote.checkedAt >= 60000)) {
    try {
      remote = await remoteNotice(adapters, { now: () => now, fetcher, all: true });
    } catch {
      remote = undefined;
    }
  }

  return remote;
}

function currentRepoId(state: NonNullable<Awaited<ReturnType<typeof loadState>>>, cwd?: string) {
  const current = cwd
    ? state.approved.find(
        (item) => resolve(cwd) === item.root || resolve(cwd).startsWith(item.root + sep),
      )
    : undefined;

  const currentRepo = current && (state.aliases[current.repoId] ?? current.repoId);

  return currentRepo;
}

function updateNotice(
  state: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  config: Awaited<ReturnType<typeof readConfig>>,
) {
  return {
    available: !!state.latest && compareSemver(state.latest, VERSION) > 0,
    required:
      (state.release?.unsafe.includes(VERSION) ?? false) && config["allow-version"] !== VERSION,
  };
}

async function refreshRelease(
  adapters: TAdapters,
  state: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  now: number,
  fetcher: TFetch,
) {
  const config = await readConfig(adapters.home);

  if (updateCheckEnabled(config["update-check"])) {
    const result = await checkRelease(state, releaseConfig.trust, now, fetcher);
    if (result.kind === "checked") await rememberRelease(adapters.home, result.feed, state.release);
  }

  await saveState(adapters.home, state);
}
