import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

export async function pruneBackups(home: string, now: number): Promise<void> {
  for (const directory of ["state", "base", "conflicts/backups"])
    await pruneDirectory(join(home, directory), now, directory === "state" || directory === "base");
}

async function pruneDirectory(directory: string, now: number, recursive: boolean): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  });

  for (const entry of entries) {
    if (entry.name.endsWith(".lock")) continue;
    const path = join(directory, entry.name);

    const match =
      /(?:\.corrupt-|^\.?)(\d{13})_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:\.tmp)?$/.exec(
        entry.name,
      );

    if (match && now - Number(match[1]) >= 2592000000)
      await rm(path, { force: true, recursive: entry.isDirectory() });
    else if (recursive && entry.isDirectory()) await pruneDirectory(path, now, true);
  }
}
