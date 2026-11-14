import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";

export const read = async (path: string) => {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) return await readFile(path, "utf8");
    if (!stat.isFile()) return undefined;

    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
};

export async function walk(dir: string, out: string[]) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "blobs" || entry.name === "file-lists") continue;
      await walk(path, out);
    } else out.push(path);
  }
}
