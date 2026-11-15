import type { deriveFileSides } from "./reconciliation/content/sides.ts";
import { conflictDocumentSchema } from "./conflicts/schema.ts";
import { readSyncRecord } from "../../state/store/records.ts";
import { sanitizeTerminal } from "../../output/sanitize.ts";
import { sha256, base32, decode, FileEntryCodec } from "@envden/core/protocol";
import { markConflicts } from "@envden/core/merge";
import { conflictNotice } from "../../output/render/sync/conflicts.ts";
import { binary } from "../../client/encoding.ts";
import { entryAuthor } from "./conflicts/author.ts";
import { checkoutPath } from "./reconciliation/placement/display.ts";
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
  sides: Pick<ReturnType<typeof deriveFileSides>, "mine" | "theirs"> & { previous?: Uint8Array },
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
  const device = target.entry ? await entryAuthor(context, entryOf(target.entry)) : undefined;

  const marked =
    mine && server
      ? markConflicts(sides.previous, mine, server, {
          mine: "this device",
          theirs: device ? `server (from ${device})` : "server",
        })
      : undefined;

  await writeBytes(file, marked?.bytes ?? mine, context.options.now);
  await writeBytes(file + ".server", server, context.options.now);
  await writeBytes(file + ".mine", mine, context.options.now);
  await writeBytes(file + ".remote", variants[1], context.options.now);

  const alternatives: string[] = [];

  for (const [index, bytes] of variants.entries()) {
    if (bytes === undefined || variants.slice(0, index).some((item) => same(item, bytes))) continue;

    const path = file + `.variant-${index}`;
    await writeBytes(path, bytes, context.options.now);
    alternatives.push(path);
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
    sanitizeTerminal(
      conflictNotice({
        path: checkoutPath(context.options.cwd, target.root, target.path),
        file,
        ...(device ? { device } : {}),
        ...(marked?.kind === "keys" ? { keys: marked.keys } : {}),
        marked: marked !== undefined,
        mine: mine === undefined ? "deleted" : "live",
        theirs: theirs.kind,
      }),
    ),
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

function entryOf(encoded: string) {
  return decode(FileEntryCodec, binary(encoded));
}
