import { compareSemver } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { conflictRecords } from "../sync/local/conflicts.ts";
import { hello } from "../client/hello.ts";
import { binary } from "../client/encoding.ts";
import type { TFetch } from "../client/fetch.ts";
import type { TAdapters } from "../adapters.ts";
import { loadState } from "../state/repository.ts";
import { refreshNotice } from "../notice/cache.ts";
import { join } from "node:path";
import { VERSION } from "../version.ts";

export async function localStatus(adapters: TAdapters, refresh = false, fetcher: TFetch = fetch) {
  const state = await loadState(adapters.home);

  if (!state?.server || !state.vaultId)
    return {
      configured: false,
      server: "unknown",
      links: [],
      update: { available: false, required: false },
    };

  const conflicts = await conflictRecords(adapters.home);

  const links = (await inspectLinks(adapters, state.links)).map((link) => ({
    ...link,
    conflict: conflicts.some((record) => record.root === link.root && record.path === link.path),
  }));

  let server = "reachable";

  try {
    await hello(state.server.address, binary(state.server.pin), fetcher, VERSION);
  } catch (cause) {
    if (!(cause instanceof EnvdenError) || cause.code !== "SERVER_UNREACHABLE") throw cause;
    server = "unknown";
  }

  if (refresh) await refreshNotice(adapters.home, state);

  return {
    configured: true,
    vaultId: state.vaultId,
    server,
    links,
    update: deriveUpdateStatus(state),
  };
}

export function deriveUpdateStatus(state: { latest?: string; release?: { unsafe: string[] } }) {
  return {
    available: !!state.latest && compareSemver(state.latest, VERSION) > 0,
    required: state.release?.unsafe.includes(VERSION) ?? false,
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
