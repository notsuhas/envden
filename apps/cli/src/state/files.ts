import { chmod, mkdir, open, rename, rm, readFile, lstat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EnvdenError } from "@envden/core/errors";

export async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);

  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe state directory");

  await chmod(path, 0o700);
}

export async function atomicWrite(path: string, bytes: string | Uint8Array): Promise<void> {
  await privateDirectory(dirname(path));
  const temporary = join(dirname(path), `.${crypto.randomUUID()}.tmp`);

  try {
    const file = await open(temporary, "wx", 0o600);

    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function optionalRead(path: string): Promise<string | undefined> {
  try {
    const stat = await lstat(path);

    if (!stat.isFile() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_DATA", "Unsafe state file");

    return await readFile(path, "utf8");
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  }
}
