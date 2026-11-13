import { readlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function isStoreLink(storePath: string, checkoutPath: string): Promise<boolean> {
  return resolve(dirname(checkoutPath), await readlink(checkoutPath)) === resolve(storePath);
}
