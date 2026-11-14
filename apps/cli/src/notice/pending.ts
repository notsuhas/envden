import { join } from "node:path";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { recoveryJoins, printRecoveryJoins } from "./recovery.ts";

async function pendingJoins(home: string): Promise<Record<string, string>> {
  const pending = await optionalRead(join(home, "state", "pending-recovery.json"));
  if (!pending) return {};

  try {
    const value: unknown = JSON.parse(pending);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    if (Object.values(value).some((name) => typeof name !== "string")) return {};

    return Object.fromEntries(
      Object.entries(value).filter((item): item is [string, string] => typeof item[1] === "string"),
    );
  } catch {
    return {};
  }
}

export async function addPendingJoins(home: string, entries: string[], ownId: Uint8Array) {
  const pending = await pendingJoins(home);

  const seen = new Set<string>(
    JSON.parse((await optionalRead(join(home, "state", "recovery-notice"))) ?? "[]"),
  );

  for (const [id, name] of Object.entries(recoveryJoins(entries, ownId))) {
    if (!seen.has(id)) pending[id] = name;
  }

  await atomicWrite(join(home, "state", "pending-recovery.json"), JSON.stringify(pending));
}

export async function reportPendingJoins(home: string) {
  const pending = await pendingJoins(home);
  await printRecoveryJoins(home, pending);
  await atomicWrite(join(home, "state", "pending-recovery.json"), "{}");
}
