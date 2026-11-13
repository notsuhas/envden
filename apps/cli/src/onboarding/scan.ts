import { vaultRepos, offerForkAlias } from "../links/fork.ts";
import { withStateLock } from "../state/lock.ts";
import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../adapters.ts";
import { saveState } from "../state/repository.ts";
import { discoverRepos } from "../links/discovery.ts";
import { linkCheckout } from "../links/place.ts";
import { consent } from "../output/questions.ts";

import type { ILocalState } from "../state/model.ts";

async function lockedsetupCheckouts(
  adapters: TAdapters,
  state: ILocalState,
  options: {
    scanRoot?: string[];
    excludeRoot?: string[];
    approve?: (checkout: ICheckout) => Promise<boolean>;
    now?: () => number;
    alias?: (source: string, target: string) => Promise<boolean>;
  },
) {
  const repos = await scanCheckouts(adapters, options);

  const storedRepos = await vaultRepos(adapters, state, options.now ?? (() => Date.now()));

  for (const checkout of repos) {
    await offerForkAlias(
      state,
      checkout,
      storedRepos,
      options.alias ?? ((source, target) => consent(`Alias ${source} to ${target}?`)),
    );

    await saveState(adapters.home, state);

    await linkCheckout(
      adapters,
      state,
      checkout,
      options.approve ?? ((item) => consent(`Approve env files in ${item.root}?`)),
    );

    await saveState(adapters.home, state);
  }
}

async function scanCheckouts(
  adapters: TAdapters,
  options: { scanRoot?: string[]; excludeRoot?: string[] },
) {
  const skipped: string[] = [];

  const repos = await discoverRepos(
    adapters.repo,
    options.scanRoot ?? [adapters.userHome],
    options.excludeRoot ?? [],
    (path, reason) => skipped.push(`${path}: skipped: ${reason}`),
  );

  for (const message of skipped) console.error(message);

  return repos;
}

export function setupCheckouts(...args: Parameters<typeof lockedsetupCheckouts>) {
  return withStateLock(args[0].home, () => lockedsetupCheckouts(...args));
}
