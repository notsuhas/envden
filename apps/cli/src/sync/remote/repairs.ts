import { z } from "zod";
import { readSyncRecord } from "../../state/store/records.ts";
import { join } from "node:path";
import { atomicWrite } from "../../state/store/files.ts";

export async function pendingRepairs(home: string): Promise<Set<string>> {
  return new Set(
    (await readSyncRecord(join(home, "state", "pending-repairs.json"), (saved) =>
      z.array(z.string()).parse(JSON.parse(saved)),
    )) ?? [],
  );
}

export async function savePendingRepairs(
  home: string,
  ids: ReadonlySet<string>,
  now: () => number,
): Promise<void> {
  await atomicWrite(join(home, "state", "pending-repairs.json"), JSON.stringify([...ids]), now);
}

export async function consumeRepair(home: string, id: string, now: () => number): Promise<void> {
  const pending = await pendingRepairs(home);
  pending.delete(id);
  await savePendingRepairs(home, pending, now);
}
