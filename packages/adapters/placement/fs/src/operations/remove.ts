import { EnvdenError } from "@envden/core/errors";
import { unlink } from "node:fs/promises";
import { libc } from "../native/libc.ts";
import { removeNative } from "../native/remove.ts";
import { requireNativePlacement } from "../native/required.ts";
import { checkoutRelative } from "../paths/checkout-relative.ts";
import { parentIdentity, verifyParents } from "../paths/parent-identity.ts";
import { isStoreLink } from "./link.ts";
import { statOrMissing } from "./stat.ts";

export async function remove(root: string, storePath: string | undefined, checkoutPath: string) {
  const path = checkoutRelative(root, checkoutPath);
  requireNativePlacement(process.platform, libc);

  if (libc) {
    // Missing parents need no creation; unsafe existing parents must still fail.
    if (!(await statOrMissing(root))) return;

    try {
      removeNative(root, path, storePath);
    } catch (cause) {
      if (cause instanceof EnvdenError && cause.code === "NOT_FOUND") return;
      throw cause;
    }

    return;
  }

  const parents = await parentIdentity(root, checkoutPath);
  const existing = await statOrMissing(checkoutPath);
  if (!existing) return;

  if (existing.isSymbolicLink()) {
    if (!storePath || !(await isStoreLink(storePath, checkoutPath)))
      throw new EnvdenError("INVALID_INPUT", "Refusing an unrelated symlink");
  } else if (!existing.isFile())
    throw new EnvdenError("INVALID_INPUT", "Destination is not a file");

  await verifyParents(parents, checkoutPath);
  await unlink(checkoutPath);
}
