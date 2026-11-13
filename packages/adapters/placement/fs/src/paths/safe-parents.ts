import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { statOrMissing } from "../operations/stat.ts";

export async function safeParents(root: string, path: string): Promise<void> {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Unsafe checkout root");
  let current = root;

  for (const part of path.split("/").slice(0, -1)) {
    current = join(current, part);
    let stat = await statOrMissing(current);

    if (!stat) stat = await createParent(current);

    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe checkout parent");
  }
}

async function createParent(current: string) {
  try {
    await mkdir(current, { mode: 0o700 });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST"))
      throw error;
  }

  return lstat(current);
}
