import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, open, lstat, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { processStart } from "./process.ts";
import { join, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { privateDirectory } from "./files.ts";

const held = new AsyncLocalStorage<ReadonlySet<string>>();

async function owner(
  path: string,
): Promise<{ pid: number; token: string; startedAt?: string } | undefined> {
  try {
    const directory = await lstat(path);
    if (!directory.isDirectory() || directory.isSymbolicLink()) return undefined;
    const file = await open(join(path, "owner.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
    let value;

    try {
      if (!(await file.stat()).isFile()) return undefined;
      value = JSON.parse(await file.readFile("utf8"));
    } finally {
      await file.close();
    }

    if (Number.isSafeInteger(value.pid) && value.pid > 0 && typeof value.token === "string")
      return value;
  } catch {
    return undefined;
  }

  return undefined;
}

export async function withStateLock<T>(home: string, fn: () => Promise<T>): Promise<T> {
  const path = join(resolve(home), "state", "write.lock");
  const current = held.getStore();
  if (current?.has(path)) return fn();
  await privateDirectory(join(resolve(home), "state"));
  const token = crypto.randomUUID();
  const startedAt = await processStart(process.pid);
  if (!startedAt) throw new EnvdenError("INTERNAL", "Cannot identify lock owner");

  await acquireLock(path);

  await writeFile(
    join(path, "owner.json"),
    JSON.stringify({ pid: process.pid, startedAt, token }),
    { mode: 0o600 },
  );

  try {
    return await held.run(new Set([...(current ?? []), path]), fn);
  } finally {
    if ((await owner(path))?.token === token) await rm(path, { recursive: true });
  }
}

async function acquireLock(path: string) {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "EEXIST")) throw cause;
    const previous = await owner(path);

    if (
      !previous ||
      ((await processStart(previous.pid)) === previous.startedAt &&
        previous.startedAt !== undefined)
    )
      throw new EnvdenError("CONFLICT", `State is locked: ${path}`, { cause });

    await reclaimLock(path, previous.token);
  }
}

async function reclaimLock(path: string, token: string) {
  try {
    await mkdir(join(path, "reclaim"));

    if ((await owner(path))?.token !== token)
      throw new EnvdenError("CONFLICT", `State is locked: ${path}`);

    await rm(path, { recursive: true });
    await mkdir(path, { mode: 0o700 });
  } catch (cause) {
    throw new EnvdenError("CONFLICT", `State is locked: ${path}`, { cause });
  }
}
