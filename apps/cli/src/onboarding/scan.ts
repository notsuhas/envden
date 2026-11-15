import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { vaultRepos, offerForkAlias } from "../links/fork.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { loadState, saveState } from "../state/store/repository.ts";
import { linkCheckout } from "../links/place.ts";
import type { IOwnLink } from "../links/file.ts";
import { offerTakeover } from "../links/takeover/offer.ts";
import { realHome } from "../output/home-path.ts";
import { consent } from "../output/prompts/questions.ts";
import { findCheckouts } from "./checkouts/find.ts";
import { chosenCheckouts } from "./checkouts/choose.ts";
import { reportOwnLinks, reportRepoSkips } from "./checkouts/report.ts";
import { rescanCommand, type TScanCommand } from "./checkouts/rescan.ts";

interface ICheckoutOptions {
  copy?: boolean;
  scanRoot?: string[];
  excludeRoot?: string[];
  approve?: (checkout: ICheckout) => Promise<boolean>;
  now: () => number;
  alias?: (source: string, target: string) => Promise<boolean>;
  takeOver?: (question: string) => Promise<boolean>;
  verbose?: boolean;
  command?: TScanCommand;
}

async function lockedsetupCheckouts(
  adapters: TAdapters,
  state: ILocalState,
  options: ICheckoutOptions,
) {
  const storedRepos = await vaultRepos(adapters, state, options.now);
  const { eligible, skips } = await findCheckouts(adapters, state, storedRepos, options);
  const home = await realHome(adapters.userHome);

  const report = {
    verbose: options.verbose,
    command: rescanCommand(options.command ?? "track", options, home),
  };

  reportRepoSkips(skips, home, report);

  const selected = options.approve
    ? eligible.map((item) => item.checkout)
    : await chosenCheckouts(adapters, state, eligible);

  const ownLinks: IOwnLink[] = [];

  for (const checkout of selected) {
    await offerForkAlias(
      state,
      checkout,
      storedRepos,
      options.alias ??
        ((source, target) =>
          consent(`${source} looks like a fork of ${target}. Share its env files with ${target}?`)),
    );

    await saveState(adapters.home, state, adapters.now);

    ownLinks.push(
      ...(await linkCheckout(
        adapters,
        state,
        checkout,
        options.approve ?? (async () => true),
        options.copy,
      )),
    );

    await saveState(adapters.home, state, adapters.now);
  }

  const left = await offerTakeover(adapters, state, ownLinks, options.copy, options.takeOver);

  await saveState(adapters.home, state, adapters.now);
  reportOwnLinks(left, home, report);
}

export function setupCheckouts(...args: Parameters<typeof lockedsetupCheckouts>) {
  return withStateLock(args[0].home, async () => {
    const state = (await loadState(args[0].home)) ?? args[1];
    await lockedsetupCheckouts(args[0], state, args[2]);
    Object.assign(args[1], state);
  });
}
