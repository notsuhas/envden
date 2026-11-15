import { milliseconds } from "date-fns";
import { millisecondsInDay } from "date-fns/constants";
import { z } from "zod";
import { machineIdentity } from "./identity.ts";
import { lstat, open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { processIdentity, processStart } from "./process.ts";

const ownerSchema = z.object({
  pid: z.int().positive(),
  token: z.string(),
  startedAt: z.string(),
  identity: z.string().optional(),
  createdAt: z.number(),
});

export type TOwner = z.infer<typeof ownerSchema>;

export async function owner(path: string): Promise<TOwner | undefined> {
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

    return ownerSchema.safeParse(value).data;
  } catch {
    return undefined;
  }
}

export function reclaimable(
  previous: TOwner,
  observed: Awaited<ReturnType<typeof processStart>>,
  identity?: string,
  now = 0,
) {
  if (!identity || previous.identity !== identity) {
    if (identity && previous.identity) {
      const before = machineIdentity(previous.identity);
      const current = machineIdentity(identity);

      if (before && current && before.host === current.host && before.boot !== current.boot)
        return true;
    }

    return now - previous.createdAt >= millisecondsInDay;
  }

  return (
    observed.kind === "dead" ||
    (observed.kind === "live" && observed.startedAt !== previous.startedAt)
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

  return now - directory.mtimeMs >= milliseconds({ seconds: 30 });
}

export async function expiredOwner(path: string, previous: TOwner | undefined, now: number) {
  if (!previous) return orphaned(path, now);
  const identity = await processIdentity();

  const observed =
    identity && previous.identity === identity
      ? await processStart(previous.pid)
      : { kind: "unknown" as const };

  return reclaimable(previous, observed, identity, now);
}
