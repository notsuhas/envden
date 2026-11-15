import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { restrictAccess } from "@envden/core/process";

export async function hasFileSource(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path + ".file");

    if (!stat.isFile() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_DATA", "Invalid key source marker");

    return true;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return false;
    throw cause;
  }
}

export async function readKeyFile(path: string): Promise<Uint8Array> {
  const file = await open(path, "r");

  try {
    if (process.platform !== "win32" && (await file.stat()).mode & 0o077)
      throw new EnvdenError("INVALID_DATA", "Key file is accessible to other users");

    return new Uint8Array(await file.readFile());
  } finally {
    await file.close();
  }
}

export async function writeKeyFile(path: string, value: Uint8Array) {
  await markFileSource(path);
  await durableWrite(path, value);
}

export async function removeKeyFile(path: string) {
  await markFileSource(path);
  await rm(path, { force: true });
  await syncDirectory(dirname(path));
}

async function markFileSource(path: string) {
  if (!(await hasFileSource(path))) await durableWrite(path + ".file", new Uint8Array());
}

export async function durableWrite(path: string, value: Uint8Array) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await restrictAccess(directory, true);
  const temporary = join(directory, `${crypto.randomUUID()}.tmp`);

  try {
    const file = await open(temporary, "wx", 0o600);

    try {
      await restrictAccess(temporary);
      await file.writeFile(value);
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporary, path);
    await syncDirectory(directory);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function syncDirectory(path: string) {
  if (process.platform === "win32") return;
  const directory = await open(path, "r");

  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
