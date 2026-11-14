import { caseInsensitive } from "../checkout/case.ts";
import type { ICheckout } from "@envden/core/adapters";
import { git } from "../exec/git.ts";

export async function tracked(checkout: ICheckout, path: string): Promise<boolean> {
  const insensitive = await caseInsensitive(checkout.root);
  const key = path.normalize("NFC");
  const files = (await git(checkout.root, ["ls-files", "-z"])).split("\0");

  return files.some((file) =>
    insensitive
      ? file.normalize("NFC").toLowerCase() === key.toLowerCase()
      : file.normalize("NFC") === key,
  );
}
