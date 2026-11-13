import type { TAdapters } from "../adapters.ts";
import { loadState } from "../state/repository.ts";
import { refreshNotice } from "../notice/cache.ts";
import { join } from "node:path";

export async function localStatus(adapters: TAdapters, refresh = false) {
  const state = await loadState(adapters.home);

  if (!state)
    return {
      configured: false,
      server: "unknown",
      links: [],
      update: { available: false, required: false },
    };

  const links = await inspectLinks(adapters, state.links);

  if (refresh) await refreshNotice(adapters.home, state);

  return {
    configured: true,
    vaultId: state.vaultId,
    server: "unknown",
    links,
    update: deriveUpdateStatus(state),
  };
}

export function deriveUpdateStatus(state: { latest?: string; release?: { unsafe: string[] } }) {
  return {
    available: !!state.latest && state.latest !== "0.0.0",
    required: state.release?.unsafe.includes("0.0.0") ?? false,
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
