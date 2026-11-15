import type { ICheckout, IRepoAdapter } from "@envden/core/adapters";
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
      item.root === checkout.root &&
      item.gitDir === checkout.gitDir &&
      item.identity === checkout.identity &&
      (state.aliases[item.repoId] ?? item.repoId) ===
        (state.aliases[checkout.repoId] ?? checkout.repoId),
  )
    ? "approved"
    : "ask";
}

export async function approvedCheckout(
  repo: Pick<IRepoAdapter, "checkoutAt">,
  state: ILocalState,
  root: string,
) {
  const checkout = await repo.checkoutAt(root);

  return checkout && checkoutApproval(state, checkout) === "approved" ? checkout : undefined;
}

export function approvalPrompt(state: ILocalState, checkout: ICheckout): string {
  const worktree =
    checkout.registeredWorktree &&
    state.approved.some(
      (item) => item.gitDir === checkout.gitDir && item.repoId === checkout.repoId,
    );

  return worktree
    ? `Approve worktree ${checkout.root} of ${checkout.repoId}?`
    : `Approve env files in ${checkout.root}?`;
}
