import { closeSync } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { libc } from "../native/libc.ts";
import { openParent } from "../native/directory.ts";
import { statOrMissing } from "../operations/stat.ts";
import { pruneAt } from "./prune-at.ts";

export async function pruneBackups(dir: string, now: number, maxAgeDays = 30): Promise<void> {
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeDays) || maxAgeDays < 0)
    throw new EnvdenError("INVALID_INPUT", "Invalid backup retention");

  const directory = await statOrMissing(dir);
  if (!directory) return;

  if (!directory.isDirectory() || directory.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe backup directory");

  const cutoff = now - maxAgeDays * 86400000;
  const fd = libc ? openParent(dir, ".entry", false) : undefined;

  try {
    for (const name of await readdir(dir)) {
      const match = /^\.envden-backup-(\d+)-[0-9a-f-]{36}$/.exec(name);
      if (!match || Number(match[1]) >= cutoff) continue;

      if (fd !== undefined) pruneAt(fd, name);
      else await pruneWindows(join(dir, name));
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

async function pruneWindows(path: string) {
  const stat = await statOrMissing(path);

  if (stat?.isFile() && !stat.isSymbolicLink())
    await unlink(path).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    });
}
