import { linkFile } from "./file.ts";
import { EnvdenError } from "@envden/core/errors";
import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { checkoutApproval } from "./approval.ts";

export async function linkCheckout(
  adapters: TAdapters,
  state: ILocalState,
  checkout: ICheckout,
  approve: (checkout: ICheckout) => Promise<boolean>,
): Promise<void> {
  const approval = checkoutApproval(state, checkout);

  if (approval === "changed")
    throw new EnvdenError("CONFLICT", "Checkout remote changed; use envden alias");

  if (approval === "ask") {
    if (!(await approve(checkout))) return;
    state.approved.push(checkout);
  }

  let placement = adapters.placement("link", checkout.root);

  if (!(await placement.supported(checkout.root)))
    placement = adapters.placement("copy", checkout.root);

  for (const path of await adapters.repo.envFiles(checkout))
    await linkFile(adapters, state, checkout, placement, path);
}
