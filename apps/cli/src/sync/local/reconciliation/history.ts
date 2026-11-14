import { readdir, lstat, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { sha256, base32 } from "@envden/core/protocol";
import { readBytes, same, writeBytes } from "../files.ts";

function historyPath(base: string, bytes: Uint8Array) {
  return join(base + ".history", base32(sha256(bytes)));
}

export async function saveBase(base: string, server: Uint8Array | undefined, now: number) {
  const previous = await readBytes(base);

  if (previous) {
    const path = historyPath(base, previous);
    await writeBytes(path, previous);
    await utimes(path, now / 1000, now / 1000);
  }

  await pruneHistory(base, now);
  await writeBytes(base, server);
}

export async function matchesBase(base: string, bytes: Uint8Array | undefined) {
  if (!bytes) return false;
  if (same(bytes, await readBytes(base))) return true;

  return same(bytes, await readBytes(historyPath(base, bytes)));
}

export async function pruneHistory(base: string, now: number) {
  for (const name of await readdir(base + ".history").catch(() => [])) {
    const path = join(base + ".history", name);
    const stat = await lstat(path);
    if (stat.isFile() && now - stat.mtimeMs >= 2592000000) await rm(path);
  }
}
