import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { readConfig } from "../../settings/config.ts";

export interface IEligible {
  checkout: ICheckout;
  files: string[];
}

export async function eligibleCheckouts(
  adapters: TAdapters,
  state: ILocalState,
  repos: ICheckout[],
  storedRepos: ReadonlySet<string>,
) {
  const eligible: IEligible[] = [];
  const rules = (await readConfig(adapters.home))["env-files"];

  for (const checkout of repos) {
    const files = await adapters.repo.envFiles(checkout, rules);

    if (files.length || storedRepos.has(state.aliases[checkout.repoId] ?? checkout.repoId))
      eligible.push({ checkout, files });
  }

  return eligible;
}
