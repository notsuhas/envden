import { realpath } from "node:fs/promises";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { discoverRepos } from "../../links/discovery/repos.ts";
import type { IRepoSkip } from "../../links/discovery/identify.ts";
import { homePath, realHome } from "../../output/home-path.ts";
import { scanProgress } from "../../output/progress/scan.ts";
import { eligibleCheckouts } from "./eligible.ts";

interface IFindOptions {
  scanRoot?: string[];
  excludeRoot?: string[];
}

export async function findCheckouts(
  adapters: TAdapters,
  state: ILocalState,
  storedRepos: ReadonlySet<string>,
  options: IFindOptions,
) {
  const roots = options.scanRoot ?? [adapters.userHome];
  const home = await realHome(adapters.userHome);

  const shown = await Promise.all(
    roots.map(async (root) => homePath(await realpath(root).catch(() => root), home)),
  );

  const progress = scanProgress(shown.join(", "));
  const skips: IRepoSkip[] = [];

  try {
    const scope = { roots, excluded: options.excludeRoot, home: adapters.userHome };

    const repos = await discoverRepos(adapters.repo, scope, {
      report: (skip) => skips.push(skip),
      progress: progress.found,
    });

    const eligible = await eligibleCheckouts(adapters, state, repos, storedRepos);
    progress.done(eligible.length);

    return { eligible, skips };
  } catch (cause) {
    progress.abort();
    throw cause;
  }
}
