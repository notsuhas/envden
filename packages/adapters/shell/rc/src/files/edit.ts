import { constants } from "node:fs";
import { mkdir, open, realpath } from "node:fs/promises";
import { dirname } from "node:path";
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
      (process.platform !== "win32" && (stat.uid !== process.getuid?.() || stat.nlink !== 1))
    )
      throw new EnvdenError("INVALID_INPUT", "Unsafe shell configuration file");

    if (process.platform === "win32") await verifyWindowsOwner(resolved);

    await hooks.opened?.();
    const original = await file.readFile();
    const next = transform(original.toString("utf8"));
    await hooks.read?.();
    if (next === original.toString("utf8")) return;
    if (backupDirectory) await backupRc(backupDirectory, original);

    await file.truncate(0);
    const bytes = Buffer.from(next);
    let offset = 0;

    while (offset < bytes.length) {
      const { bytesWritten } = await file.write(bytes, offset, bytes.length - offset, offset);
      offset += bytesWritten;
    }

    await file.sync();
  } finally {
    await file.close();
  }
}
