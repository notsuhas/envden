import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { privateDirectory } from "./files.ts";

const held = new AsyncLocalStorage<ReadonlySet<string>>();
const startedAt = new Date(performance.timeOrigin).toISOString();

function alive(pid: number) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

async function owner(path: string): Promise<{ pid: number; token: string } | undefined> {
  try {
    const value = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));

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

  try {
    await mkdir(path, { mode: 0o700 });
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "EEXIST")) throw cause;
    const previous = await owner(path);

    if (!previous || alive(previous.pid))
      throw new EnvdenError("CONFLICT", `State is locked: ${path}`, { cause });

    const stale = join(path, "reclaim");

    try {
      await mkdir(stale);
      const latest = await owner(path);

      if (latest?.token !== previous.token)
        throw new EnvdenError("CONFLICT", `State is locked: ${path}`);

      await rm(path, { recursive: true });
      await mkdir(path, { mode: 0o700 });
    } catch (error) {
      throw new EnvdenError("CONFLICT", `State is locked: ${path}`, { cause: error });
    }
  }

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
