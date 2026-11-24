import { sha256, base32 } from "@envden/core/protocol";
import { readFile, lstat, rm, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { withStateLock } from "../../state/lock/lock.ts";
import { atomicWrite } from "../../state/store/files.ts";

export async function readBytes(path: string): Promise<Uint8Array | undefined> {
  try {
    const stat = await lstat(path);

    if (!stat.isFile() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_DATA", "Unsafe sync file");

    return new Uint8Array(await readFile(path));
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  }
}

export function same(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  return a === undefined || b === undefined ? a === b : Buffer.from(a).equals(b);
}

export function basePath(home: string, store: string, root?: string): string {
  const id = base32(sha256(new TextEncoder().encode(root ? `${store}\0${root}` : store)));

  return join(home, "base", id);
}

export async function writeBytes(
  path: string,
  bytes: Uint8Array | undefined,
  now: () => number,
): Promise<void> {
  if (same(await readBytes(path), bytes)) return;

  if (bytes === undefined) {
    await rm(path, { force: true });

    const directory = await open(dirname(path), "r");

    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } else await atomicWrite(path, bytes, now);
}

export async function withSyncLock<T>(home: string, action: () => Promise<T>): Promise<T> {
  return withStateLock(home, action);
}
