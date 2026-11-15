import type { ICheckout } from "@envden/core/adapters";
import type { ILocalState } from "../state/model.ts";
import type { TAdapters } from "../adapters.ts";
import { syncContext } from "../sync/remote/context.ts";
import { entryName, readableEntries } from "../sync/remote/content.ts";
import { deriveAlias } from "./alias.ts";

export function shouldAskAlias(
  state: ILocalState,
  checkout: ICheckout,
  repos: ReadonlySet<string>,
) {
  const target = checkout.upstreamRepoId;

  const roots = new Set(
    state.approved.filter((item) => item.repoId === checkout.repoId).map((item) => item.root),
  );

  return (
    !!target &&
    !state.links.some((item) => roots.has(item.root)) &&
    repos.has(target) &&
    !(state.aliasAsked ?? []).includes(checkout.repoId) &&
    !state.aliases[checkout.repoId] &&
    deriveAlias(state.aliases, checkout.repoId, target).kind === "assign"
  );
}

export async function vaultRepos(adapters: TAdapters, state: ILocalState, now: () => number) {
  if (!state.checkpoint) return new Set<string>();
  const context = await syncContext(adapters, { now, fetcher: adapters.fetcher, all: true });

  return new Set(
    readableEntries(context)
      .filter((entry) => entry.state === 1 || entry.state === 3)
      .map((entry) => entryName(context, entry).repoId),
  );
}

export async function offerForkAlias(
  state: ILocalState,
  checkout: ICheckout,
  repos: ReadonlySet<string>,
  confirm: (source: string, target: string) => Promise<boolean>,
) {
  if (!shouldAskAlias(state, checkout, repos)) return;
  const target = checkout.upstreamRepoId!;
  state.aliasAsked = [...(state.aliasAsked ?? []), checkout.repoId];
  if (await confirm(checkout.repoId, target)) state.aliases[checkout.repoId] = target;
}
