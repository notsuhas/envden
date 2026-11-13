import { sha256, base32 } from "@envden/core/protocol";
import { readFile, lstat, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { withStateLock } from "../../state/lock.ts";
import { atomicWrite } from "../../state/files.ts";

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

export async function writeBytes(path: string, bytes: Uint8Array | undefined): Promise<void> {
  if (bytes === undefined) await rm(path, { force: true });
  else await atomicWrite(path, bytes);
}

export async function withSyncLock<T>(home: string, action: () => Promise<T>): Promise<T> {
  const path = join(home, "state", "sync.lock");
  await mkdir(join(home, "state"), { recursive: true, mode: 0o700 });

  try {
    await mkdir(path, { mode: 0o700 });
  } catch (cause) {
    throw new EnvdenError(
      "CONFLICT",
      "Another sync is running; remove state/sync.lock only if it stopped",
      { cause },
    );
  }

  try {
    return await withStateLock(home, action);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}
