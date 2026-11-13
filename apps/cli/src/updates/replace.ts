import { chmod, rename, rm, lstat } from "node:fs/promises";
import { atomicWrite } from "../state/files.ts";
import { EnvdenError } from "@envden/core/errors";

export async function replaceBinary(path: string, bytes: Uint8Array, windows: boolean) {
  const stat = await lstat(path);

  if (!stat.isFile() || stat.isSymbolicLink())
    throw new EnvdenError("INVALID_INPUT", "Unsafe binary destination");

  const temporary = `${path}.envden-new`;
  await atomicWrite(temporary, bytes);
  await chmod(temporary, 0o755);
  const old = `${path}.envden-old`;
  if (windows) await rename(path, old);

  try {
    await rename(temporary, path);
  } catch (cause) {
    if (windows) await rename(old, path);
    await rm(temporary, { force: true });
    throw cause;
  }
}

export async function cleanupOldBinary(path: string, windows: boolean) {
  if (windows) await rm(`${path}.envden-old`, { force: true });
}
