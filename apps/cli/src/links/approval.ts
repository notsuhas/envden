import type { ICheckout, IRepoAdapter } from "@envden/core/adapters";
import type { ILocalState } from "../state/model.ts";
import { homePath } from "../output/home-path.ts";

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

export function checkoutLabel(
  state: ILocalState,
  checkout: ICheckout,
  files: string[],
  userHome: string,
): string {
  const worktree =
    checkout.registeredWorktree &&
    state.approved.some(
      (item) => item.gitDir === checkout.gitDir && item.repoId === checkout.repoId,
    );

  const path = homePath(checkout.root, userHome);
  const found = files.length ? files.join(", ") : "files from the vault";

  return worktree ? `${path}, worktree of ${checkout.repoId} (${found})` : `${path} (${found})`;
}
