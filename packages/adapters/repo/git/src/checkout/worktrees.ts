import type { ICheckout } from "@envden/core/adapters";
import { git } from "../exec/git.ts";

export async function worktrees(checkout: ICheckout): Promise<string[]> {
  const output = await git(checkout.root, ["worktree", "list", "--porcelain", "-z"]);

  return output
    .split("\0")
    .filter((field) => field.startsWith("worktree "))
    .map((field) => field.slice(9));
}
