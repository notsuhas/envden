import type { ICheckout } from "@envden/core/adapters";
import { join } from "node:path";
import { git } from "../exec/git.ts";
import { exitCode } from "../failures/exit-code.ts";

// git's own parser handles quoting, escapes and comments; each record is "key\nvalue"
export async function submodules(checkout: ICheckout): Promise<string[]> {
  const output = await git(checkout.root, [
    "config",
    "--file",
    join(checkout.root, ".gitmodules"),
    "--no-includes",
    "-z",
    "--get-regexp",
    "^submodule\\..*\\.path$",
  ]).catch(noneFound);

  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => record.slice(record.indexOf("\n") + 1));
}

// exit 1 means no .gitmodules or no path in it
function noneFound(error: unknown): string {
  if (exitCode(error) === 1) return "";

  throw error;
}
