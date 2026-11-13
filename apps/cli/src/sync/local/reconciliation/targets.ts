import { supportedPlacement } from "../../../links/checkout/supported.ts";
import type { TSyncContext } from "../../remote/context.ts";

export async function reconciliationTargets(
  context: TSyncContext,
  repos: Set<string>,
  name: { repoId: string; path: string },
  store: string,
) {
  const targets = context.state.links.filter((link) => !link.localOnly && link.store === store);

  for (const approved of context.state.approved.filter(
    (item) =>
      repos.has(context.state.aliases[item.repoId] ?? item.repoId) &&
      (context.state.aliases[item.repoId] ?? item.repoId) === name.repoId,
  )) {
    if (context.state.links.some((link) => link.root === approved.root && link.path === name.path))
      continue;

    const placement = await supportedPlacement(
      context.adapters,
      approved.root,
      false,
      undefined,
      false,
    );

    targets.push({
      root: approved.root,
      path: name.path,
      store,
      mode: placement.mode,
    });
  }

  return targets;
}
