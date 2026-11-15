import type { ICheckout, IRepoAdapter } from "@envden/core/adapters";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { readConfig } from "../../settings/config.ts";
import { sanitizeTerminal } from "../../output/sanitize.ts";
import { checkoutApproval } from "../approval.ts";

// A registered worktree lives in the clone's own .git, so making one already needs write access to the clone.
export function worktreeApproval(
  state: ILocalState,
  checkout: ICheckout,
  clone: ICheckout | undefined,
  enabled: boolean,
): "approved" | "ask" {
  if (
    !enabled ||
    !checkout.registeredWorktree ||
    !clone ||
    clone.registeredWorktree ||
    clone.root === checkout.root ||
    clone.gitDir !== checkout.gitDir ||
    repoOf(state, clone) !== repoOf(state, checkout) ||
    state.approved.some((item) => item.root === checkout.root)
  )
    return "ask";

  return checkoutApproval(state, clone) === "approved" ? "approved" : "ask";
}

export async function autoApprovedWorktree(
  adapters: Pick<TAdapters, "repo" | "home">,
  state: ILocalState,
  checkout: ICheckout,
) {
  if (!checkout.registeredWorktree || checkoutApproval(state, checkout) !== "ask") return false;
  const enabled = (await readConfig(adapters.home))["auto-approve-worktrees"];

  return (
    worktreeApproval(
      state,
      checkout,
      await approvedClone(adapters.repo, state, checkout),
      enabled,
    ) === "approved"
  );
}

export async function adoptWorktreeAt(
  adapters: Pick<TAdapters, "repo" | "home">,
  state: ILocalState,
  path: string,
  report: (message: string) => void,
) {
  const checkout = await adapters.repo.checkoutAt(path).catch(() => undefined);
  if (!checkout || !(await autoApprovedWorktree(adapters, state, checkout))) return;

  state.approved.push(checkout);
  report(worktreeApprovedNotice(checkout));
}

export function worktreeApprovedNotice(checkout: ICheckout) {
  return sanitizeTerminal(`Approved worktree ${checkout.root} (auto-approve-worktrees)`);
}

async function approvedClone(
  repo: Pick<IRepoAdapter, "checkoutAt">,
  state: ILocalState,
  checkout: ICheckout,
) {
  for (const item of state.approved) {
    if (item.gitDir !== checkout.gitDir || item.root === checkout.root) continue;
    const clone = await repo.checkoutAt(item.root).catch(() => undefined);
    if (clone && !clone.registeredWorktree) return clone;
  }

  return undefined;
}

function repoOf(state: ILocalState, checkout: ICheckout) {
  return state.aliases[checkout.repoId] ?? checkout.repoId;
}
