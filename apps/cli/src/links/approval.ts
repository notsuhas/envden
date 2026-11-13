import type { ICheckout } from "@envden/core/adapters";
import type { ILocalState } from "../state/model.ts";

export function checkoutApproval(
  state: ILocalState,
  checkout: ICheckout,
): "approved" | "changed" | "ask" {
  const sameRoot = state.approved.find((item) => item.root === checkout.root);

  if (
    sameRoot &&
    (state.aliases[sameRoot.repoId] ?? sameRoot.repoId) !==
      (state.aliases[checkout.repoId] ?? checkout.repoId)
  )
    return "changed";

  return state.approved.some(
    (item) =>
      (item.root === checkout.root || checkout.registeredWorktree === true) &&
      item.gitDir === checkout.gitDir &&
      (state.aliases[item.repoId] ?? item.repoId) ===
        (state.aliases[checkout.repoId] ?? checkout.repoId),
  )
    ? "approved"
    : "ask";
}
