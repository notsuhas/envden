import { milliseconds } from "date-fns";
import { lstat, mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { owner } from "./owner.ts";

export async function reclaimLock(
  path: string,
  token: string | undefined,
  now: number,
  beforeRename?: () => Promise<void>,
) {
  const guard = join(path, "reclaim");

  try {
    await mkdir(guard);
  } catch {
    const stat = await lstat(guard).catch(() => undefined);
    if (!stat || now - stat.mtimeMs < milliseconds({ seconds: 30 })) return false;
    await rm(guard, { recursive: true, force: true });

    return reclaimLock(path, token, now);
  }

  if ((await owner(path))?.token !== token) {
    await rm(guard, { recursive: true, force: true });

    return false;
  }

  await beforeRename?.();
  const abandoned = `${path}.${crypto.randomUUID()}.abandoned`;
  await rename(path, abandoned);

  if ((await owner(abandoned))?.token !== token) {
    await rename(abandoned, path);
    await rm(guard, { recursive: true, force: true });

    return false;
  }

  await rm(abandoned, { recursive: true, force: true });

  return true;
}
