import { lstat, mkdir } from "node:fs/promises";
import { EnvdenError } from "@envden/core/errors";
import { owner, expiredOwner } from "./owner.ts";
import { reclaimLock } from "./reclaim.ts";

export interface ILockTiming {
  now: () => number;
  wait: (ms: number) => Promise<void>;
  delays: readonly number[];
}

export async function acquireLock(path: string, timing: ILockTiming) {
  for (let attempt = 0; ; attempt++) {
    if (await tryAcquire(path, timing.now())) return;
    const delay = timing.delays[attempt];
    if (delay === undefined) throw new EnvdenError("CONFLICT", `State is locked: ${path}`);
    await timing.wait(delay);
  }
}

async function tryAcquire(path: string, now: number): Promise<boolean> {
  if (await createDirectory(path)) return true;

  const stat = await lstat(path).catch(() => undefined);
  if (!stat) return false;
  if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
  const previous = await owner(path);

  if (!(await expiredOwner(path, previous, now))) return false;
  if (!(await reclaimLock(path, previous?.token))) return false;

  return tryAcquire(path, now);
}

async function createDirectory(path: string) {
  try {
    await mkdir(path, { mode: 0o700 });

    return true;
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "EEXIST")) throw cause;
  }

  return false;
}
