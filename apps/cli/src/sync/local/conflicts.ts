import { sanitizeTerminal } from "../../output/sanitize.ts";
import { sha256, base32 } from "@envden/core/protocol";
import { join } from "node:path";
import type { TSyncContext } from "../remote/context.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { readBytes, writeBytes } from "./files.ts";

export interface IConflictRecord {
  store: string;
  root: string;
  path: string;
  mode: "copy" | "link";
  base: string;
  file: string;
  server: string;
  mine: string;
  deleted: boolean;
  mineDeleted: boolean;
}

export async function conflictRecords(home: string): Promise<IConflictRecord[]> {
  return JSON.parse((await optionalRead(join(home, "state", "conflicts.json"))) ?? "[]");
}

export async function saveConflicts(home: string, records: IConflictRecord[]): Promise<void> {
  await atomicWrite(join(home, "state", "conflicts.json"), JSON.stringify(records));
}

export async function recordConflict(
  context: TSyncContext,
  target: Omit<IConflictRecord, "file" | "server" | "mine" | "deleted" | "mineDeleted">,
  mine: Uint8Array | undefined,
  server: Uint8Array | undefined,
): Promise<void> {
  const records = await conflictRecords(context.adapters.home);

  const file = join(
    context.adapters.home,
    "conflicts",
    base32(sha256(new TextEncoder().encode(target.base))),
  );

  if (records.some((item) => item.base === target.base)) return;
  await writeBytes(file, mine ?? new Uint8Array());
  await writeBytes(file + ".server", server);
  await writeBytes(file + ".mine", mine);

  records.push({
    ...target,
    file,
    server: file + ".server",
    mine: file + ".mine",
    mineDeleted: mine === undefined,
    deleted: server === undefined,
  });

  await saveConflicts(context.adapters.home, records);

  context.options.report?.(
    sanitizeTerminal(`Conflict: ${target.path}; edit ${file}, then run envden resolve`),
  );
}

export async function backup(home: string, path: string, now: number): Promise<void> {
  const bytes = await readBytes(path);

  if (bytes)
    await atomicWrite(join(home, "conflicts", "backups", `${now}-${crypto.randomUUID()}`), bytes);
}
