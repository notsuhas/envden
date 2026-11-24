import { supportedPlacement } from "./checkout/supported.ts";
import { readConfig } from "../settings/config.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { linkFile, type IOwnLink } from "./file.ts";
import { siblingLink } from "./takeover/sibling.ts";
import { EnvdenError } from "@envden/core/errors";
import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { checkoutApproval } from "./approval.ts";
import { autoApprovedWorktree, worktreeApprovedNotice } from "./checkout/worktree.ts";

async function lockedlinkCheckout(
  adapters: TAdapters,
  state: ILocalState,
  checkout: ICheckout,
  approve: (checkout: ICheckout) => Promise<boolean>,
  copy = false,
  report: (message: string) => void = console.error,
): Promise<IOwnLink[]> {
  const approval = checkoutApproval(state, checkout);

  if (approval === "changed")
    throw new EnvdenError(
      "CONFLICT",
      "Checkout remote changed; run envden untrack <path>, then envden track <path>",
    );

  if (approval === "ask") {
    if (await autoApprovedWorktree(adapters, state, checkout))
      report(worktreeApprovedNotice(checkout));
    else if (!(await approve(checkout))) return [];
  }

  state.approved = state.approved.filter((item) => item.root !== checkout.root);
  state.approved.push(checkout);

  const placement = await supportedPlacement(adapters, checkout.root, copy);

  const ownLinks: IOwnLink[] = [];

  const paths = await adapters.repo.envFiles(
    checkout,
    (await readConfig(adapters.home))["env-files"],
  );

  for (const path of paths) {
    const result = await linkFile(adapters, state, checkout, placement, path);
    if (result.kind === "own-link") ownLinks.push(result.link);
  }

  return ownLinks.filter((link) => !siblingLink(link, paths));
}

export function linkCheckout(...args: Parameters<typeof lockedlinkCheckout>) {
  return withStateLock(args[0].home, () => lockedlinkCheckout(...args));
}
