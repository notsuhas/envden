import { readConfig } from "../settings/config.ts";
import { chooseMany } from "../output/questions.ts";
import { EnvdenError } from "@envden/core/errors";
import { sanitizeTerminal } from "../output/sanitize.ts";
import { vaultRepos, offerForkAlias } from "../links/fork.ts";
import { withStateLock } from "../state/lock/lock.ts";
import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../adapters.ts";
import { loadState, saveState } from "../state/store/repository.ts";
import { discoverRepos } from "../links/discovery.ts";
import { linkCheckout } from "../links/place.ts";
import { approvalPrompt } from "../links/approval.ts";
import { consent } from "../output/questions.ts";

import type { ILocalState } from "../state/model.ts";

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
  const selected = options.approve ? eligible : await chooseCheckouts(state, eligible);

  for (const checkout of selected) {
    await offerForkAlias(
      state,
      checkout,
      storedRepos,
      options.alias ?? ((source, target) => consent(`Alias ${source} to ${target}?`)),
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

async function chooseCheckouts(state: ILocalState, repos: ICheckout[]) {
  if (!repos.length) return [];

  if (!process.stdin.isTTY)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Approve checkouts in your own terminal with envden track",
    );

  const roots = await chooseMany(
    "Approve checkouts to track",
    repos.map((repo) => ({
      value: repo.root,
      label: sanitizeTerminal(approvalPrompt(state, repo)),
    })),
  );

  return repos.filter((repo) => roots.includes(repo.root));
}

async function eligibleCheckouts(
  adapters: TAdapters,
  state: ILocalState,
  repos: ICheckout[],
  storedRepos: ReadonlySet<string>,
) {
  const eligible: ICheckout[] = [];

  for (const checkout of repos) {
    if (
      (await adapters.repo.envFiles(checkout, (await readConfig(adapters.home))["env-files"]))
        .length ||
      storedRepos.has(state.aliases[checkout.repoId] ?? checkout.repoId)
    )
      eligible.push(checkout);
  }

  return eligible;
}
