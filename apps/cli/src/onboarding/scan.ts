import type { TAdapters } from "../adapters.ts";
import { saveState } from "../state/repository.ts";
import { discoverRepos } from "../links/discovery.ts";
import { linkCheckout } from "../links/place.ts";
import { consent } from "../output/questions.ts";

import type { ILocalState } from "../state/model.ts";

export async function setupCheckouts(
  adapters: TAdapters,
  state: ILocalState,
  options: { scanRoot?: string[]; excludeRoot?: string[] },
) {
  const repos = await scanCheckouts(adapters, options);

  for (const checkout of repos) {
    if (!(await adapters.repo.envFiles(checkout)).length) continue;

    await linkCheckout(adapters, state, checkout, (item) =>
      consent(`Approve env files in ${item.root}?`),
    );

    await saveState(adapters.home, state);
  }
}

async function scanCheckouts(
  adapters: TAdapters,
  options: { scanRoot?: string[]; excludeRoot?: string[] },
) {
  return discoverRepos(
    adapters.repo,
    options.scanRoot ?? [adapters.userHome],
    options.excludeRoot ?? [],
  );
}
