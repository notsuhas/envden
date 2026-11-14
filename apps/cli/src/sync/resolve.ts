import * as p from "@envden/core/protocol";
import { binary } from "../client/encoding.ts";
import { placeFileTarget } from "./local/reconciliation/placement.ts";
import { basePath } from "./local/files.ts";
import { markAppliedEntry } from "./local/applied.ts";
import { rm } from "node:fs/promises";
import { loadState, saveState } from "../state/store/repository.ts";
import { saveBase } from "./local/reconciliation/history.ts";
import { resolve } from "node:path";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { conflictRecords, saveConflicts, backup } from "./local/conflicts.ts";
import { readBytes, writeBytes, withSyncLock } from "./local/files.ts";

export function resolveConflict(
  adapters: TAdapters,
  options: {
    file?: string;
    repo?: string;
    choice: "keep-mine" | "take-server" | "edit";
    now?: () => number;
  },
) {
  return withSyncLock(adapters.home, async () => {
    const records = await conflictRecords(adapters.home);

    const matches = records.filter((item) => matchesConflict(item, options));

    if (matches.length !== 1)
      throw new EnvdenError("INVALID_INPUT", "Name exactly one conflict file");

    const now = (options.now ?? Date.now)();
    const record = matches[0]!;
    const server = record.deleted ? undefined : await readBytes(record.server);

    const bytes = await resolutionBytes(options.choice, record, server);

    for (const path of [record.mine, record.server, ...record.alternatives])
      await backup(adapters.home, path, now);

    await backup(adapters.home, record.store, now);
    await writeBytes(record.store, bytes);

    await placeResolution(adapters, record, bytes, server, now);

    console.log("Resolved env file; previous versions are in the store conflicts/backups folder");

    await saveConflicts(
      adapters.home,
      records.filter((item) => item !== record),
    );

    for (const path of [record.file, record.server, record.mine, ...record.alternatives])
      await rm(path, { force: true });

    return { kind: "resolved" as const, path: record.path };
  });
}

async function resolutionBytes(
  choice: "keep-mine" | "take-server" | "edit",
  record: Awaited<ReturnType<typeof conflictRecords>>[number],
  server: Uint8Array | undefined,
) {
  if (choice === "take-server") return server;
  if (choice === "edit") return readBytes(record.file);

  return record.mineDeleted ? undefined : readBytes(record.mine);
}

function matchesConflict(
  item: Awaited<ReturnType<typeof conflictRecords>>[number],
  options: { repo?: string; file?: string },
) {
  const repo = options.repo ? resolve(options.repo) : undefined;
  if (repo && !item.targets.some((target) => target.root === repo)) return false;
  if (!options.file) return true;

  return (
    item.path === options.file ||
    item.file === options.file ||
    item.targets.some((target) => resolve(options.file!) === join(target.root, item.path))
  );
}

async function placeResolution(
  adapters: TAdapters,
  record: Awaited<ReturnType<typeof conflictRecords>>[number],
  bytes: Uint8Array | undefined,
  server: Uint8Array | undefined,
  now: number,
) {
  const state = await loadState(adapters.home);

  if (!state) throw new EnvdenError("NOT_FOUND", "Local sync state is unavailable");

  for (const target of record.targets)
    await resolveTarget(adapters, state, record, target, bytes, server, now);

  await saveState(adapters.home, state);

  if (record.entry) {
    await saveBase(record.base, server, now);
    await markAppliedEntry(adapters.home, record.entry);
  }
}

async function resolveTarget(
  adapters: TAdapters,
  state: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  record: Awaited<ReturnType<typeof conflictRecords>>[number],
  target: (typeof record.targets)[number],
  bytes: Uint8Array | undefined,
  server: Uint8Array | undefined,
  now: number,
) {
  await placeFileTarget(
    { adapters, state, options: { now: () => now, fetcher: adapters.fetcher } },
    target,
    bytes,
    record.entry
      ? p.decode(p.FileEntryCodec, binary(record.entry)).state === 1
      : server !== undefined,
  );

  const base = basePath(
    adapters.home,
    record.store,
    target.mode === "copy" ? target.root : undefined,
  );

  await saveBase(base, target.mode === "copy" ? bytes : server, now);
}
