import { lstat, type FileHandle } from "node:fs/promises";
import { EnvdenError } from "@envden/core/errors";

export async function rcStat(file: FileHandle, resolved: string) {
  const opened = await file.stat();
  const stat = await lstat(resolved);
  validateRc(opened);
  validateRc(stat);

  if (opened.dev !== stat.dev || opened.ino !== stat.ino)
    throw new EnvdenError("CONFLICT", "Shell configuration changed during editing");

  return stat;
}

function validateRc(stat: Awaited<ReturnType<typeof lstat>>) {
  if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.())
    throw new EnvdenError("INVALID_INPUT", "Unsafe shell configuration file");
}
