import { readConfig } from "../settings/config.ts";
import { chooseMany } from "../output/prompts/questions.ts";
import { EnvdenError } from "@envden/core/errors";
import { vaultRepos, offerForkAlias } from "../links/fork.ts";
import { withStateLock } from "../state/lock/lock.ts";
import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../adapters.ts";
import { loadState, saveState } from "../state/store/repository.ts";
import { discoverRepos } from "../links/discovery.ts";
import { linkCheckout } from "../links/place.ts";
import { checkoutLabel } from "../links/approval.ts";
import { realHome } from "../output/home-path.ts";
import { autoApprovedWorktree } from "../links/checkout/worktree.ts";
import { consent } from "../output/prompts/questions.ts";

import type { ILocalState } from "../state/model.ts";

interface IEligible {
  checkout: ICheckout;
  files: string[];
}

async function lockedsetupCheckouts(
  adapters: TAdapters,
  state: ILocalState,
  options: {
    copy?: boolean;
    scanRoot?: string[];
    excludeRoot?: string[];
    approve?: (checkout: ICheckout) => Promise<boolean>;
    now: () => number;
    alias?: (source: string, target: string) => Promise<boolean>;
  },
) {
  const repos = await scanCheckouts(adapters, options);

  const storedRepos = await vaultRepos(adapters, state, options.now);

  const eligible = await eligibleCheckouts(adapters, state, repos, storedRepos);

  const selected = options.approve
    ? eligible.map((item) => item.checkout)
    : await chosenCheckouts(adapters, state, eligible);

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

    await linkCheckout(
      adapters,
      state,
      checkout,
      options.approve ?? (async () => true),
      options.copy,
    );

    await saveState(adapters.home, state, adapters.now);
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
  return withStateLock(args[0].home, async () => {
    const state = (await loadState(args[0].home)) ?? args[1];
    await lockedsetupCheckouts(args[0], state, args[2]);
    Object.assign(args[1], state);
  });
}

async function chosenCheckouts(adapters: TAdapters, state: ILocalState, eligible: IEligible[]) {
  const automatic: ICheckout[] = [];
  const asked: IEligible[] = [];

  for (const item of eligible)
    if (await autoApprovedWorktree(adapters, state, item.checkout)) automatic.push(item.checkout);
    else asked.push(item);

  return [...automatic, ...(await chooseCheckouts(adapters, state, asked))];
}

async function chooseCheckouts(adapters: TAdapters, state: ILocalState, asked: IEligible[]) {
  if (!asked.length) return [];

  if (!process.stdin.isTTY)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Approve checkouts in your own terminal with envden track",
    );

  const home = await realHome(adapters.userHome);

  const roots = await chooseMany(
    "Sync env files for these checkouts?",
    asked.map((item) => ({
      value: item.checkout.root,
      label: checkoutLabel(state, item.checkout, item.files, home),
    })),
  );

  if (!roots.length) console.log("No checkouts selected. Add one later with: envden track <path>");

  return asked.map((item) => item.checkout).filter((checkout) => roots.includes(checkout.root));
}

async function eligibleCheckouts(
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
