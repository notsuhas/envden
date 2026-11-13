import type { TPlacementMode } from "@envden/core/adapters";
import { statOrMissing } from "./stat.ts";
import { isStoreLink } from "./link.ts";
import { checkoutRelative } from "../paths/checkout-relative.ts";
import { randomUUID } from "node:crypto";
import { chmod, lstat, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { safeParents } from "../paths/safe-parents.ts";

export async function place(
  mode: TPlacementMode,
  root: string,
  storePath: string,
  checkoutPath: string,
): Promise<void> {
  const path = checkoutRelative(root, checkoutPath);
  await safeParents(root, path);
  const destination = resolve(checkoutPath);
  const existing = await statOrMissing(destination);

  if (existing?.isSymbolicLink() && !(await isStoreLink(storePath, destination)))
    throw new Error("Refusing an unrelated symlink");

  if (existing && !existing.isFile() && !existing.isSymbolicLink())
    throw new Error("Destination is not a file");

  const storeStat = await lstat(storePath);

  if (!storeStat.isFile() || storeStat.isSymbolicLink())
    throw new Error("Store source is not a regular file");

  await chmod(storePath, 0o600);
  const temporary = join(dirname(destination), `.envden-${randomUUID()}`);

  try {
    if (mode === "link") await symlink(resolve(storePath), temporary);
    else await writeFile(temporary, await readFile(storePath), { mode: 0o600, flag: "wx" });

    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
