import { readdir, rm, lstat } from "node:fs/promises";
import { join } from "node:path";

export async function pruneBackups(home: string, now: number): Promise<void> {
  for (const directory of ["state", "base"]) await pruneStateBackups(join(home, directory), now);

  const directory = join(home, "conflicts", "backups");
  let names: string[];

  try {
    names = await readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }

  for (const name of names) {
    const match = /^(\d+)-[a-f0-9-]+$/.exec(name);

    if (match && now - Number(match[1]) >= 2592000000)
      await rm(join(directory, name), { force: true });
  }
}

async function pruneStateBackups(directory: string, now: number): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) await pruneStateBackups(path, now);
    else if (
      entry.isFile() &&
      (entry.name.includes(".corrupt-") || /^\..+\.tmp$/.test(entry.name))
    ) {
      const stat = await lstat(path);

      if (now - stat.mtimeMs >= 2592000000) await rm(path, { force: true });
    }
  }
}
