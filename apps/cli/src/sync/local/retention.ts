import { pruneHistory } from "./reconciliation/history.ts";
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

export async function pruneBaseHistory(home: string, now: number) {
  const directory = join(home, "base");
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith(".history"))
      await pruneHistory(join(directory, entry.name.slice(0, -8)), now);
  }
}
