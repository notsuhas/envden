import { updateStatus } from "../updates/status.ts";
import { conflictRecords } from "../sync/local/conflicts.ts";
import { hello } from "../client/hello.ts";
import { binary } from "../client/encoding.ts";
import type { TFetch } from "../client/fetch.ts";
import type { TAdapters } from "../adapters.ts";
import { loadState } from "../state/store/repository.ts";
import { refreshNotice } from "../notice/cache.ts";
import { join } from "node:path";
import { MIN_SERVER } from "../version.ts";
import { serverReachability } from "./reachability.ts";

export async function localStatus(
  adapters: TAdapters,
  refresh = false,
  fetcher: TFetch = adapters.fetcher,
) {
  const state = await loadState(adapters.home);

  if (!state?.server || !state.vaultId)
    return {
      configured: false,
      server: "unknown",
      links: [],
      update: await updateStatus(adapters.home),
    };

  const conflicts = await conflictRecords(adapters.home);

  const links = (await inspectLinks(adapters, state.links)).map((link) => ({
    ...link,
    conflict: conflicts.some((record) => record.root === link.root && record.path === link.path),
  }));

  let reachability: { server: string; reason?: string } = { server: "reachable" };

  try {
    await hello(state.server.address, binary(state.server.pin), fetcher, MIN_SERVER);
  } catch (error) {
    reachability = serverReachability(error);
  }

  if (refresh)
    await refreshNotice(
      adapters.home,
      state,
      (root) => adapters.repo.caseInsensitive(root, true),
      adapters.now,
    );

  return {
    configured: true,
    vaultId: state.vaultId,
    server: reachability.server,
    ...(reachability.reason ? { serverReason: reachability.reason } : {}),
    links,
    update: await updateStatus(adapters.home),
  };
}

async function inspectLinks(
  adapters: TAdapters,
  entries: NonNullable<Awaited<ReturnType<typeof loadState>>>["links"],
) {
  const links = [];

  for (const link of entries)
    links.push({
      root: link.root,
      path: link.path,
      mode: link.mode,
      localOnly: link.localOnly ?? false,
      status: await adapters
        .placement(link.mode, link.root)
        .inspect(link.store, join(link.root, link.path)),
    });

  return links;
}
