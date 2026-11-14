import { reportPendingJoins } from "./pending.ts";
import { boundedFetch } from "./fetch.ts";
import { cacheOffers } from "./offers.ts";
import { runUpdateCheck } from "../updates/run.ts";
import { updateStatus } from "../updates/status.ts";
import { cleanupOldBinary } from "../updates/replace.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { sanitizeTerminal } from "../output/sanitize.ts";
import { sep, resolve } from "node:path";
import type { TAdapters } from "../adapters.ts";
import type { TFetch } from "../client/fetch.ts";
import { loadState } from "../state/store/repository.ts";
import { refreshNotice, noticeStatus } from "./cache.ts";
import { readRemoteNotice, remoteNotice } from "./remote.ts";

async function lockedcommandNotice(
  adapters: TAdapters,
  now: number,
  fetcher: TFetch,
  refresh = false,
  cwd?: string,
  localOnly = false,
) {
  await cleanupOldBinary(process.execPath, process.platform === "win32");
  if (!refresh && !localOnly) await runUpdateCheck(adapters, now, false, fetcher);
  const state = await loadState(adapters.home);
  if (!state) return { repos: [], update: await updateStatus(adapters.home) };

  if (!refresh) await reportPendingJoins(adapters.home);
  const remote = await readRemoteNotice(adapters.home);

  await refreshNotice(adapters.home, state, (root) => adapters.repo.caseInsensitive(root, true));
  const update = await updateStatus(adapters.home);
  await cacheOffers(adapters, state, cwd, update, now);
  const local = await noticeStatus(adapters.home, state);

  const currentRepo = currentRepoId(state, cwd);

  return {
    repos: [...new Set([...local.map((item) => item.repoId), ...(remote?.repos ?? [])])]
      .filter((repo) => repo !== currentRepo)
      .map(sanitizeTerminal),
    update,
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
