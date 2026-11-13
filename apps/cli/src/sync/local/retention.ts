import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

export async function pruneBackups(home: string, now: number): Promise<void> {
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
