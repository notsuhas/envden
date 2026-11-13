import { join } from "node:path";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";

export async function pendingRepairs(home: string): Promise<Set<string>> {
  return new Set(
    JSON.parse((await optionalRead(join(home, "state", "pending-repairs.json"))) ?? "[]"),
  );
}

export async function savePendingRepairs(home: string, ids: ReadonlySet<string>): Promise<void> {
  await atomicWrite(join(home, "state", "pending-repairs.json"), JSON.stringify([...ids]));
}

export async function consumeRepair(home: string, id: string): Promise<void> {
  const pending = await pendingRepairs(home);
  pending.delete(id);
  await savePendingRepairs(home, pending);
}
