import { constants } from "node:fs";
import { mkdir, open, realpath, rename, rm, lstat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { verifyWindowsOwner } from "./windows.ts";
import { backupRc } from "./backup.ts";

interface IEditHooks {
  resolved?: () => Promise<void>;
  opened?: () => Promise<void>;
  read?: () => Promise<void>;
}

export async function editRc(
  path: string,
  transform: (current: string) => string,
  backupDirectory?: string,
  hooks: IEditHooks = {},
) {
  await mkdir(dirname(path), { recursive: true });
  let resolved: string;
  let flags = constants.O_RDWR | constants.O_NOFOLLOW;

  try {
    resolved = await realpath(path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    if (transform("") === "") return;
    resolved = path;
    flags |= constants.O_CREAT | constants.O_EXCL;
  }

  await hooks.resolved?.();
  const file = await open(resolved, flags, 0o600);

  try {
    const stat = await file.stat();

    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (process.platform !== "win32" && stat.uid !== process.getuid?.())
    )
      throw new EnvdenError("INVALID_INPUT", "Unsafe shell configuration file");

    if (process.platform === "win32") await verifyWindowsOwner(resolved);

    await hooks.opened?.();
    const original = await file.readFile();
    const next = transform(original.toString("latin1"));
    await hooks.read?.();
    if (next === original.toString("latin1")) return;
    if (backupDirectory) await backupRc(backupDirectory, original);

    const temporary = join(dirname(resolved), `.envden-rc-${crypto.randomUUID()}`);
    const replacement = await open(temporary, "wx", stat.mode & 0o777);

    try {
      await replacement.chmod(stat.mode & 0o777);
      await replacement.writeFile(Buffer.from(next, "latin1"));
      await replacement.sync();
      const current = await lstat(resolved);
      if (current.dev !== stat.dev || current.ino !== stat.ino) return;
      await rename(temporary, resolved);
    } finally {
      await replacement.close();
      await rm(temporary, { force: true });
    }
  } finally {
    await file.close();
  }
}
