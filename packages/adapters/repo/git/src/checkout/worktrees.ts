import type { ICheckout } from "@envden/core/adapters";
import { normalize } from "node:path";
import { git } from "../exec/git.ts";

const LIST = ["worktree", "list", "--porcelain"];

// git before 2.36 has no -z here, so it falls back to newline-separated records
export async function worktrees(
  checkout: ICheckout,
  run = (args: string[]) => git(checkout.root, args),
): Promise<string[]> {
  const separated = await run([...LIST, "-z"]).catch(() => undefined);
  if (separated !== undefined) return worktreePaths(separated, "\0");

  return worktreePaths(await run(LIST), "\n");
}

// records end with an empty field; a prunable worktree's folder is gone and a bare one has no files
function worktreePaths(output: string, separator: string) {
  return output
    .split(separator + separator)
    .map((record) => record.split(separator))
    .filter((fields) => !fields.some((field) => field === "bare" || field.startsWith("prunable")))
    .flatMap((fields) => fields.filter((field) => field.startsWith("worktree ")))
    .map((field) => normalize(field.slice(9)));
}
