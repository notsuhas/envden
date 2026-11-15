import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// Windows has no mode bits; its ACLs are restricted when each file is written.
export async function ownerOnly(directory: string): Promise<boolean> {
  if (process.platform === "win32") return true;

  const entries = await readdir(directory).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });

  if (!entries) return true;

  const paths = [directory, ...entries.map((entry) => join(directory, entry))];
  const modes = await Promise.all(paths.map(async (path) => (await stat(path)).mode));

  return modes.every((mode) => (mode & 0o077) === 0);
}
