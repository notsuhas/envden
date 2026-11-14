import { relative, isAbsolute } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import type { ISyncOptions } from "../model.ts";
import { pruneMissingCheckouts } from "../../links/prune.ts";
import { checkoutApproval } from "../../links/approval.ts";

export async function selectedRepos(
  adapters: TAdapters,
  state: ILocalState,
  options: ISyncOptions,
  skippedRoots = new Set<string>(),
): Promise<Set<string>> {
  await pruneMissingCheckouts(adapters.home, state, options.report ?? ignoreNotice);
  const repos = new Set<string>();

  for (const approved of state.approved) {
    const rel = relative(approved.root, options.cwd ?? process.cwd());
    if (!includesCheckout(options.all, rel)) continue;
    const checkout = await adapters.repo.checkoutAt(approved.root);

    const approval = checkout ? checkoutApproval(state, checkout) : "ask";

    if (approval === "ask") {
      skippedRoots.add(approved.root);
      options.report?.("Skipped checkout requiring approval; run envden track");
      continue;
    }

    if (approval === "changed")
      throw new EnvdenError("CONFLICT", "Approved checkout changed; use envden alias");

    repos.add(state.aliases[approved.repoId] ?? approved.repoId);
  }

  if (!options.all && repos.size === 0)
    throw new EnvdenError("UNAUTHORIZED", "Run in an approved checkout or use --all");

  return repos;
}

function includesCheckout(all: boolean | undefined, rel: string) {
  return all || (!rel.startsWith("..") && !isAbsolute(rel));
}

function ignoreNotice() {}
