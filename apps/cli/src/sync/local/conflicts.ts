import { EnvdenError } from "@envden/core/errors";
import { sanitizeTerminal } from "../../output/sanitize.ts";
import { sha256, base32 } from "@envden/core/protocol";
import { join } from "node:path";
import type { TSyncContext } from "../remote/context.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { readBytes, writeBytes, same } from "./files.ts";

export interface IConflictRecord {
  remote: string;
  alternatives: string[];
  targets: TSyncContext["state"]["links"];
  entry: string | null;
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
  const saved = await optionalRead(join(home, "state", "conflicts.json"));
  if (saved === undefined) return [];
  const document: { model: string; records: IConflictRecord[] } = JSON.parse(saved);

  if (document.model !== "shared-store" || !Array.isArray(document.records))
    throw new EnvdenError("INVALID_DATA", "Invalid local conflict state");

  return document.records;
}

export async function saveConflicts(home: string, records: IConflictRecord[]): Promise<void> {
  await atomicWrite(
    join(home, "state", "conflicts.json"),
    JSON.stringify({ model: "shared-store", records }),
  );
}

export async function recordConflict(
  context: TSyncContext,
  target: Omit<
    IConflictRecord,
    "remote" | "file" | "server" | "mine" | "deleted" | "mineDeleted" | "alternatives"
  >,
  mine: Uint8Array | undefined,
  server: Uint8Array | undefined,
  variants: (Uint8Array | undefined)[] = [],
): Promise<void> {
  const records = await conflictRecords(context.adapters.home);

  const file = join(
    context.adapters.home,
    "conflicts",
    base32(sha256(new TextEncoder().encode(target.base))),
  );

  if (records.some((item) => item.base === target.base)) return;
  await writeBytes(file, mine);
  await writeBytes(file + ".server", server);
  await writeBytes(file + ".mine", mine);
  await writeBytes(file + ".remote", variants[1]);

  const sources = [
    target.store,
    "server",
    ...target.targets.map((item) => join(item.root, item.path)),
  ];

  for (const [side, bytes] of [
    ["Mine", mine],
    ["Theirs", server],
  ] as const) {
    const source = sources[variants.findIndex((value) => same(value, bytes))] ?? target.store;

    context.options.report?.(
      sanitizeTerminal(`${side}: ${source}; saved ${file}.${side === "Mine" ? "mine" : "server"}`),
    );
  }

  const alternatives: string[] = [];

  for (const [index, bytes] of variants.entries()) {
    if (bytes === undefined) continue;
    const path = file + `.variant-${index}`;
    await writeBytes(path, bytes);
    alternatives.push(path);

    const source = sources[index]!;

    context.options.report?.(sanitizeTerminal(`Saved ${source}: ${path}`));
  }

  records.push({
    alternatives,
    remote: file + ".remote",
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

export async function backup(home: string, path: string, now: number): Promise<string | undefined> {
  const bytes = await readBytes(path);

  if (bytes) {
    const saved = join(home, "conflicts", "backups", `${now}-${crypto.randomUUID()}`);
    await atomicWrite(saved, bytes);

    return saved;
  }
}

export async function removeConflictTargets(home: string, root: string) {
  const records = await conflictRecords(home);
  if (!records.some((record) => record.targets.some((target) => target.root === root))) return;

  for (const record of records)
    record.targets = record.targets.filter((target) => target.root !== root);

  await saveConflicts(home, records);
}
