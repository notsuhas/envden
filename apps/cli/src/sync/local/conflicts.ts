import type { deriveFileSides } from "./reconciliation/content/sides.ts";
import { conflictDocumentSchema } from "./conflicts/schema.ts";
import { readSyncRecord } from "../../state/store/records.ts";
import { sanitizeTerminal } from "../../output/sanitize.ts";
import { sha256, base32 } from "@envden/core/protocol";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { TSyncContext } from "../remote/context.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { readBytes, writeBytes, same, basePath } from "./files.ts";

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
  const document = await readSyncRecord(join(home, "state", "conflicts.json"), (saved) =>
    conflictDocumentSchema.parse(JSON.parse(saved)),
  );

  if (document === undefined) return [];

  return document.records;
}

export async function saveConflicts(
  home: string,
  records: IConflictRecord[],
  now: () => number,
): Promise<void> {
  await atomicWrite(
    join(home, "state", "conflicts.json"),
    JSON.stringify({ model: "shared-store", records }),
    now,
  );
}

export async function recordConflict(
  context: TSyncContext,
  target: Omit<
    IConflictRecord,
    "remote" | "file" | "server" | "mine" | "deleted" | "mineDeleted" | "alternatives"
  >,
  sides: Pick<ReturnType<typeof deriveFileSides>, "mine" | "theirs">,
  variants: (Uint8Array | undefined)[] = [],
): Promise<void> {
  const { mine, theirs } = sides;
  const server = theirs.kind === "live" ? theirs.bytes : undefined;
  const records = await conflictRecords(context.adapters.home);

  const file = join(
    context.adapters.home,
    "conflicts",
    base32(sha256(new TextEncoder().encode(target.base))),
  );

  if (records.some((item) => item.base === target.base)) return;
  await writeBytes(file, mine, context.options.now);
  await writeBytes(file + ".server", server, context.options.now);
  await writeBytes(file + ".mine", mine, context.options.now);
  await writeBytes(file + ".remote", variants[1], context.options.now);

  const sources = [
    target.store,
    "server",
    ...target.targets.map((item) => join(item.root, item.path)),
  ];

  for (const [side, bytes] of [
    ["Mine", mine],
    ["Theirs", server],
  ] as const) {
    if (side === "Theirs" && theirs.kind === "absent") {
      context.options.report?.(
        "Theirs: no server entry; keep mine or edit the local conflict file",
      );

      continue;
    }

    const source = conflictSource(side, bytes, sources, variants, target.store);

    context.options.report?.(
      sanitizeTerminal(`${side}: ${source}; saved ${file}.${side === "Mine" ? "mine" : "server"}`),
    );
  }

  const alternatives: string[] = [];

  for (const [index, bytes] of variants.entries()) {
    if (bytes === undefined) continue;
    const path = file + `.variant-${index}`;
    await writeBytes(path, bytes, context.options.now);
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
    deleted: theirs.kind === "tombstone",
  });

  await saveConflicts(context.adapters.home, records, context.options.now);

  context.options.report?.(
    sanitizeTerminal(`Conflict: ${target.path}; edit ${file}, then run envden resolve`),
  );
}

export async function backup(home: string, path: string, now: number): Promise<string | undefined> {
  const bytes = await readBytes(path);

  if (bytes) {
    const saved = join(
      home,
      "conflicts",
      "backups",
      `${String(now).padStart(13, "0")}_${crypto.randomUUID()}`,
    );

    await atomicWrite(saved, bytes, () => now);

    return saved;
  }
}

export async function removeConflictTargets(home: string, root: string, now: () => number) {
  const records = await conflictRecords(home);
  if (!records.some((record) => record.targets.some((target) => target.root === root))) return;

  const retained: IConflictRecord[] = [];

  for (const record of records) {
    if (!record.targets.some((target) => target.root === root)) {
      retained.push(record);
      continue;
    }

    record.targets = record.targets.filter((target) => target.root !== root);
    if (!record.targets.length) continue;
    const stored = await readBytes(record.store);
    const base = await readBytes(record.base);

    const divergent = await Promise.all(
      record.targets.map(async (target) => {
        const path = join(target.root, target.path);
        const stat = await lstat(path).catch(() => undefined);
        if (!stat?.isFile()) return false;
        const bytes = await readBytes(path);

        return (
          bytes !== undefined &&
          !same(bytes, stored) &&
          !same(
            bytes,
            await readBytes(
              basePath(home, record.store, target.mode === "copy" ? target.root : undefined),
            ),
          )
        );
      }),
    );

    if (!same(stored, base) || divergent.some(Boolean)) retained.push(record);
  }

  await saveConflicts(home, retained, now);
}

function conflictSource(
  side: string,
  bytes: Uint8Array | undefined,
  sources: string[],
  variants: (Uint8Array | undefined)[],
  store: string,
) {
  if (bytes === undefined) return "deleted";
  if (side === "Theirs") return "server";

  return sources[variants.findIndex((value) => same(value, bytes))] ?? store;
}
