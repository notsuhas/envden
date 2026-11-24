import { basePath, readBytes } from "../../files.ts";

// Unfinished journals, deletions, corrupt records and a missing store are left for a manual pull.
export async function quietStore(home: string, store: string) {
  const base = basePath(home, store);

  for (const record of [".pending", ".delete", ".corrupt"])
    if ((await readBytes(base + record)) !== undefined) return false;

  return (await readBytes(store)) !== undefined;
}
