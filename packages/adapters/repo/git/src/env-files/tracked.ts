import type { ICheckout } from "@envden/core/adapters";
import { git } from "../exec/git.ts";

export async function tracked(checkout: ICheckout, path: string): Promise<boolean> {
  return (await git(checkout.root, ["ls-files", "-z", "--", path])).length > 0;
}
