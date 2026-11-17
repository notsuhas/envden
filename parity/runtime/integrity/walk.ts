import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function* retainedFiles(root: string): AsyncGenerator<string> {
  const stat = await lstat(root);
  if (stat.isSymbolicLink()) return;

  if (stat.isDirectory()) {
    for (const name of await readdir(root)) yield* retainedFiles(join(root, name));
  } else if (stat.isFile()) yield root;
}
