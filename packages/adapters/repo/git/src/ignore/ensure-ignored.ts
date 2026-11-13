import { excludeParents, verifyExcludeParents } from "./parents.ts";
import { constants } from "node:fs";
import { EnvdenError } from "@envden/core/errors";
import type { ICheckout } from "@envden/core/adapters";
import { git } from "../exec/git.ts";
import { open, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tracked } from "../env-files/tracked.ts";
import { validatePath } from "../env-files/validate-path.ts";
import { isIgnored } from "./is-ignored.ts";

export async function ensureIgnored(checkout: ICheckout, path: string): Promise<void> {
  validatePath(path);

  if (/[\p{Cc}\p{Cf}*?[\]#!~;|&$`<>"'(){}]/u.test(path))
    throw new EnvdenError("INVALID_INPUT", "Unsafe ignore path");

  if (await tracked(checkout, path))
    throw new EnvdenError("INVALID_INPUT", "Refusing a tracked env file");

  if (await isIgnored(checkout, path)) return;

  const exclude = resolve(
    checkout.root,
    (await git(checkout.root, ["rev-parse", "--git-path", "info/exclude"])).trimEnd(),
  );

  const parents = await excludeParents(checkout.gitDir, exclude);

  const escaped = path.replace(/[\\*?[\]#! ]/g, "\\$&");

  const file = await open(
    exclude,
    constants.O_WRONLY |
      constants.O_APPEND |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  );

  try {
    if (!(await file.stat()).isFile())
      throw new EnvdenError("INVALID_INPUT", "Exclude is not a regular file");

    if ((await realpath(dirname(exclude))) !== dirname(exclude))
      throw new EnvdenError("INVALID_INPUT", "Unsafe exclude parent");

    await verifyExcludeParents(parents);
    await file.writeFile(`\n/${escaped}\n`);
  } finally {
    await file.close();
  }

  if (!(await isIgnored(checkout, path)))
    throw new EnvdenError("INVALID_INPUT", "Could not ignore env file");
}
