import type { IPlacementAdapter, TPlacementMode } from "@envden/core/adapters";
import { statOrMissing } from "./stat.ts";
import { isStoreLink } from "./link.ts";
import { checkoutRelative } from "../paths/checkout-relative.ts";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function inspect(
  mode: TPlacementMode,
  root: string,
  storePath: string,
  checkoutPath: string,
): ReturnType<IPlacementAdapter["inspect"]> {
  const path = checkoutRelative(root, checkoutPath);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Unsafe checkout root");
  // Inspect parents without creating missing checkout folders.
  let parent = root;

  for (const part of path.split("/").slice(0, -1)) {
    parent = join(parent, part);
    const stat = await statOrMissing(parent);
    if (!stat) return "missing";
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe checkout parent");
  }

  const stat = await statOrMissing(checkoutPath);
  if (!stat) return "missing";

  if (stat.isSymbolicLink())
    return (await isStoreLink(storePath, checkoutPath)) ? "linked" : "detached";

  if (!stat.isFile()) return "detached";
  const matches = (await readFile(checkoutPath)).equals(await readFile(storePath));
  if (!matches) return "detached";

  return mode === "link" ? "relinkable" : "linked";
}
