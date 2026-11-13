import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { owner } from "./owner.ts";

export async function reclaimLock(path: string, token: string | undefined) {
  const guard = join(path, "reclaim");

  try {
    await mkdir(guard);
  } catch {
    return false;
  }

  if ((await owner(path))?.token !== token) {
    await rm(guard, { recursive: true, force: true });

    return false;
  }

  const abandoned = `${path}.${crypto.randomUUID()}.abandoned`;
  await rename(path, abandoned);
  await rm(abandoned, { recursive: true, force: true });

  return true;
}
