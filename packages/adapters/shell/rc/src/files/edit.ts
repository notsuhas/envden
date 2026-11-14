import { constants } from "node:fs";
import { mkdir, open, realpath, rename, rm, lstat, chmod } from "node:fs/promises";
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
  const edit = await readRc(path, transform, backupDirectory, hooks);
  if (!edit) return;
  const { resolved, stat, next } = edit;
  const temporary = join(dirname(resolved), `.envden-rc-${crypto.randomUUID()}`);

  try {
    const replacement = await open(temporary, "wx", stat.mode & 0o777);

    try {
      await replacement.chmod(stat.mode & 0o777);
      await replacement.writeFile(Buffer.from(next, "latin1"));
      await replacement.sync();
    } finally {
      await replacement.close();
    }

    const current = await lstat(resolved);

    if (!sameRc(current, stat))
      throw new EnvdenError("CONFLICT", "Shell configuration changed during editing");

    await replaceRc(temporary, resolved, stat);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readRc(
  path: string,
  transform: (current: string) => string,
  backupDirectory: string | undefined,
  hooks: IEditHooks,
) {
  const target = await resolveRc(path, transform);
  if (!target) return;
  const { resolved, flags } = target;

  await hooks.resolved?.();
  const file = await open(resolved, flags, 0o600);

  try {
    const stat = await file.stat();

    validateRc(stat);

    if (process.platform === "win32") await verifyWindowsOwner(resolved);

    await hooks.opened?.();
    const original = await file.readFile();
    const next = transform(original.toString("latin1"));
    await hooks.read?.();
    if (next === original.toString("latin1")) return;
    if (backupDirectory) await backupRc(backupDirectory, original);

    return { resolved, stat, next };
  } finally {
    await file.close();
  }
}

async function replaceRc(
  temporary: string,
  destination: string,
  expected: Awaited<ReturnType<typeof lstat>>,
) {
  try {
    await rename(temporary, destination);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "EPERM")) throw cause;
    const current = await lstat(destination);

    if (!sameRc(current, expected) || current.mode & 0o200) throw cause;

    await chmod(destination, current.mode | 0o200);

    try {
      await rename(temporary, destination);
    } catch (error) {
      await chmod(destination, current.mode);
      throw error;
    }
  }
}

async function resolveRc(path: string, transform: (current: string) => string) {
  await mkdir(dirname(path), { recursive: true });
  let resolved: string;
  let flags = constants.O_RDONLY | constants.O_NOFOLLOW;

  try {
    resolved = await realpath(path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    if (transform("") === "") return;
    resolved = path;
    flags |= constants.O_CREAT | constants.O_EXCL;
  }

  return { resolved, flags };
}

function validateRc(stat: Awaited<ReturnType<typeof lstat>>) {
  if (
    !stat.isFile() ||
    stat.nlink !== 1 ||
    (process.platform !== "win32" && stat.uid !== process.getuid?.())
  )
    throw new EnvdenError("INVALID_INPUT", "Unsafe shell configuration file");
}

function sameRc(
  current: Awaited<ReturnType<typeof lstat>>,
  expected: Awaited<ReturnType<typeof lstat>>,
) {
  return (["dev", "ino", "size", "mtimeMs", "ctimeMs"] as const).every(
    (key) => current[key] === expected[key],
  );
}
