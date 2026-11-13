import type { ICheckout } from "@envden/core/adapters";
import { git } from "../exec/git.ts";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tracked } from "../env-files/tracked.ts";
import { validatePath } from "../env-files/validate-path.ts";
import { isIgnored } from "./is-ignored.ts";

export async function ensureIgnored(checkout: ICheckout, path: string): Promise<void> {
  validatePath(path);
  if (await tracked(checkout, path)) throw new Error("Refusing a tracked env file");
  if (await isIgnored(checkout, path)) return;

  const exclude = resolve(
    checkout.root,
    (await git(checkout.root, ["rev-parse", "--git-path", "info/exclude"])).trimEnd(),
  );

  await mkdir(dirname(exclude), { recursive: true, mode: 0o700 });
  const escaped = path.replace(/[\\*?[\]#! ]/g, "\\$&");
  await appendFile(exclude, `\n/${escaped}\n`, { mode: 0o600 });
  if (!(await isIgnored(checkout, path))) throw new Error("Could not ignore env file");
}
