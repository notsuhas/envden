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

  if (await tracked(checkout, path))
    throw new EnvdenError("INVALID_INPUT", "Refusing a tracked env file");

  if (await isIgnored(checkout, path)) return;

  if (/[\p{Cc}\p{Cf}]/u.test(path)) throw new EnvdenError("INVALID_INPUT", "Unsafe ignore path");

  const exclude = resolve(
    checkout.root,
    (await git(checkout.root, ["rev-parse", "--git-path", "info/exclude"])).trimEnd(),
  );

  const parents = await excludeParents(checkout.gitDir, exclude);

  const escaped = path.replace(/[\\*?[\]#! ]/g, "\\$&");

  const file = await open(
    exclude,
    constants.O_RDWR |
      constants.O_APPEND |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  );

  try {
    const stat = await file.stat();

    if (!stat.isFile() || stat.nlink !== 1 || (process.getuid && stat.uid !== process.getuid()))
      throw new EnvdenError("INVALID_INPUT", "Exclude is not a private regular file");

    if ((await realpath(dirname(exclude))) !== dirname(exclude))
      throw new EnvdenError("INVALID_INPUT", "Unsafe exclude parent");

    await verifyExcludeParents(parents);
    const original = await file.readFile("utf8");
    const line = `/${escaped}`;
    const added = !original.split("\n").includes(line);
    const suffix = `\n${line}\n`;
    if (added) await file.writeFile(suffix);

    try {
      if (!(await isIgnored(checkout, path)))
        throw new EnvdenError("INVALID_INPUT", "Could not ignore env file");
    } catch (error) {
      if (added && (await file.stat()).size === stat.size + Buffer.byteLength(suffix))
        await file.truncate(stat.size);

      throw error;
    }
  } finally {
    await file.close();
  }
}
