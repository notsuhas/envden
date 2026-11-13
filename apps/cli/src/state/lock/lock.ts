import { AsyncLocalStorage } from "node:async_hooks";
import { lstat, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { EnvdenError } from "@envden/core/errors";
import { privateDirectory } from "../store/files.ts";
import { processStart } from "./process.ts";
import { publishOwner } from "./publish.ts";
import { owner } from "./owner.ts";
import { acquireLock, type ILockTiming } from "./acquire.ts";

const held = new AsyncLocalStorage<ReadonlySet<string>>();

let ownStart: ReturnType<typeof processStart> | undefined;

const timing: ILockTiming = {
  now: () => performance.timeOrigin + performance.now(),
  wait: (ms) => new Promise((done) => setTimeout(done, ms)),
  delays: [50, 100, 200, 400, 800, 1000],
};

export async function withStateLock<T>(
  home: string,
  fn: () => Promise<T>,
  clock = timing,
): Promise<T> {
  const path = join(resolve(home), "state", "write.lock");
  const current = held.getStore();
  if (current?.has(path)) return fn();
  await privateDirectory(join(resolve(home), "state"));
  const token = crypto.randomUUID();
  const observed = await (ownStart ??= processStart(process.pid));
  if (observed.kind !== "live") throw new EnvdenError("INTERNAL", "Cannot identify lock owner");

  await acquireLock(path, clock);
  const directory = await lstat(path);

  try {
    await publishOwner(path, { pid: process.pid, startedAt: observed.startedAt, token });
    const published = await lstat(path);

    if (published.ino !== directory.ino || published.dev !== directory.dev)
      throw new EnvdenError("CONFLICT", "Lock ownership changed");

    return await held.run(new Set([...(current ?? []), path]), fn);
  } finally {
    if ((await owner(path))?.token === token) await rm(path, { recursive: true });
  }
}
