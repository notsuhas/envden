import { lstat, open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { processStart } from "./process.ts";

export interface IOwner {
  pid: number;
  token: string;
  startedAt?: string;
}

export async function owner(path: string): Promise<IOwner | undefined> {
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

export function reclaimable(previous: IOwner, observed: Awaited<ReturnType<typeof processStart>>) {
  return (
    observed.kind === "dead" ||
    (observed.kind === "live" &&
      previous.startedAt !== undefined &&
      observed.startedAt !== previous.startedAt)
  );
}

async function orphaned(path: string, now: number): Promise<boolean> {
  const directory = await lstat(path).catch(() => undefined);
  if (!directory?.isDirectory() || directory.isSymbolicLink()) return false;

  try {
    await lstat(join(path, "owner.json"));

    return false;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) return false;
  }

  return now - directory.mtimeMs >= 30000;
}

export async function expiredOwner(path: string, previous: IOwner | undefined, now: number) {
  return previous ? reclaimable(previous, await processStart(previous.pid)) : orphaned(path, now);
}
