import type { ICheckout } from "@envden/core/adapters";
import { normalize } from "node:path";
import { git } from "../exec/git.ts";

export async function worktrees(checkout: ICheckout): Promise<string[]> {
  const output = await git(checkout.root, ["worktree", "list", "--porcelain", "-z"]);

  return output
    .split("\0")
    .filter((field) => field.startsWith("worktree "))
    .map((field) => normalize(field.slice(9)));
}
