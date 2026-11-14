import { lstat, open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { processIdentity, processStart } from "./process.ts";

export interface IOwner {
  pid: number;
  token: string;
  startedAt?: string;
  identity?: string | undefined;
  createdAt?: number;
}

export async function owner(path: string): Promise<IOwner | undefined> {
  try {
    const directory = await lstat(path);
    if (!directory.isDirectory() || directory.isSymbolicLink()) return undefined;
    const ownerPath = join(path, "owner.json");
    if ((await lstat(ownerPath)).isSymbolicLink()) return undefined;
    const file = await open(ownerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
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

export function reclaimable(
  previous: IOwner,
  observed: Awaited<ReturnType<typeof processStart>>,
  identity?: string,
  now = 0,
) {
  if (!identity || previous.identity !== identity)
    return previous.createdAt !== undefined && now - previous.createdAt >= 86400000;

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
  if (!previous) return orphaned(path, now);
  const identity = await processIdentity();

  const observed =
    identity && previous.identity === identity
      ? await processStart(previous.pid)
      : { kind: "unknown" as const };

  const directory = await lstat(path);

  return reclaimable(
    { ...previous, createdAt: previous.createdAt ?? directory.mtimeMs },
    observed,
    identity,
    now,
  );
}
