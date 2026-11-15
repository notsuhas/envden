import { readlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { sameTarget } from "../paths/same-target.ts";

export async function isStoreLink(storePath: string, checkoutPath: string): Promise<boolean> {
  return sameTarget(resolve(dirname(checkoutPath), await readlink(checkoutPath)), storePath);
}
