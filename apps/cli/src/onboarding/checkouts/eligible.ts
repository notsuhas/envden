import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import pLimit from "p-limit";
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
  const rules = (await readConfig(adapters.home))["env-files"];
  const git = pLimit(8);

  // listed together, kept in the scan's order
  const listed = await Promise.all(
    repos.map(async (checkout) => ({
      checkout,
      files: await git(() => adapters.repo.envFiles(checkout, rules)),
    })),
  );

  return listed.filter(
    (item) =>
      item.files.length ||
      storedRepos.has(state.aliases[item.checkout.repoId] ?? item.checkout.repoId),
  );
}
