import { supportedPlacement } from "./checkout/supported.ts";
import { readConfig } from "../settings/config.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { linkFile } from "./file.ts";
import { EnvdenError } from "@envden/core/errors";
import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { checkoutApproval } from "./approval.ts";

async function lockedlinkCheckout(
  adapters: TAdapters,
  state: ILocalState,
  checkout: ICheckout,
  approve: (checkout: ICheckout) => Promise<boolean>,
  copy = false,
): Promise<void> {
  const approval = checkoutApproval(state, checkout);

  if (approval === "changed")
    throw new EnvdenError("CONFLICT", "Checkout remote changed; use envden alias");

  if (approval === "ask") {
    if (!(await approve(checkout))) return;
  }

  state.approved = state.approved.filter((item) => item.root !== checkout.root);
  state.approved.push(checkout);

  const placement = await supportedPlacement(adapters, checkout.root, copy);

  for (const path of await adapters.repo.envFiles(
    checkout,
    (await readConfig(adapters.home))["env-files"],
  ))
    await linkFile(adapters, state, checkout, placement, path);
}

export function linkCheckout(...args: Parameters<typeof lockedlinkCheckout>) {
  return withStateLock(args[0].home, () => lockedlinkCheckout(...args));
}
