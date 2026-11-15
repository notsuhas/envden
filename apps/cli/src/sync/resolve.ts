import { requestDeletion } from "./local/reconciliation/operation/deletion.ts";
import * as p from "@envden/core/protocol";
import { binary } from "../client/encoding.ts";
import { placeFileTarget } from "./local/reconciliation/placement/target.ts";
import { basePath } from "./local/files.ts";
import { markAppliedEntry } from "./local/applied.ts";
import { rm } from "node:fs/promises";
import { loadState, saveState } from "../state/store/repository.ts";
import { saveBase } from "./local/reconciliation/history.ts";
import { resolve } from "node:path";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { hasConflictMarkers } from "@envden/core/merge";
import type { TAdapters } from "../adapters.ts";
import { conflictRecords, saveConflicts, backup } from "./local/conflicts.ts";
import { readBytes, writeBytes, withSyncLock } from "./local/files.ts";

export function resolveConflict(
  adapters: TAdapters,
  options: {
    file?: string;
    repo?: string;
    choice: "keep-mine" | "take-server" | "edit";
    now: () => number;
  },
) {
  return withSyncLock(adapters.home, async () => {
    const records = await conflictRecords(adapters.home);
    const matches = selectConflicts(records, options);

    if (matches.length !== 1)
      throw new EnvdenError("INVALID_INPUT", "Name exactly one conflict file");

    const now = options.now();
    const record = matches[0]!;
    const server = record.deleted ? undefined : await readBytes(record.server);

    const bytes = await resolutionBytes(options.choice, record, server);

    const preserved: string[] = [];
    const backups: { source: string; path: string }[] = [];

    for (const path of [record.mine, record.server, record.remote, ...record.alternatives]) {
      const saved = await backup(adapters.home, path, now);

      if (saved) {
        preserved.push(saved);
        backups.push({ source: path, path: saved });
      }
    }

    const storeBackup = await backup(adapters.home, record.store, now);

    if (storeBackup) {
      preserved.push(storeBackup);
      backups.push({ source: record.store, path: storeBackup });
    }

    await recordDeletion(adapters.home, record, bytes, () => now);

    await rm(basePath(adapters.home, record.store) + ".pending", { force: true });
    await rm(basePath(adapters.home, record.store) + ".corrupt", { force: true });
    await writeBytes(record.store, bytes, () => now);

    const placementReports = await placeResolution(
      adapters,
      record,
      bytes,
      await readBytes(record.remote),
      now,
    );

    await saveConflicts(
      adapters.home,
      records.filter((item) => item !== record),
      () => now,
    );

    for (const path of [
      record.file,
      record.server,
      record.remote,
      record.mine,
      ...record.alternatives,
    ])
      await rm(path, { force: true });

    return {
      kind: "resolved" as const,
      path: record.path,
      preserved,
      placementReports,
      backups: join(adapters.home, "conflicts", "backups"),
      savedBackups: backups,
    };
  });
}

async function resolutionBytes(
  choice: "keep-mine" | "take-server" | "edit",
  record: Awaited<ReturnType<typeof conflictRecords>>[number],
  server: Uint8Array | undefined,
) {
  if (choice === "take-server") {
    if (record.entry === null)
      throw new EnvdenError(
        "INVALID_INPUT",
        "No server entry; keep mine or edit the local conflict file",
      );

    return record.deleted ? undefined : requireContent(server);
  }

  if (choice === "edit") return editedBytes(record);

  return record.mineDeleted ? undefined : requireContent(await readBytes(record.mine));
}

async function editedBytes(record: Awaited<ReturnType<typeof conflictRecords>>[number]) {
  const edited = await readBytes(record.file);

  if (edited === undefined && !record.mineDeleted)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Conflict file is missing; choose a recorded deletion side explicitly",
    );

  if (edited && hasConflictMarkers(edited))
    throw new EnvdenError(
      "INVALID_INPUT",
      `Conflict markers are still in ${record.file}. Edit it, or pass --keep-mine or --take-server`,
    );

  return edited;
}

function selectConflicts(
  records: Awaited<ReturnType<typeof conflictRecords>>,
  options: { repo?: string; file?: string },
) {
  const repo = options.repo ? resolve(options.repo) : undefined;

  const scoped = records.filter(
    (item) => !repo || item.targets.some((target) => target.root === repo),
  );

  const { file } = options;
  if (!file) return scoped;

  const placed = scoped.filter(
    (item) =>
      item.file === file ||
      item.targets.some((target) => resolve(file) === join(target.root, item.path)),
  );

  return placed.length ? placed : scoped.filter((item) => item.path === file);
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

  const reports: string[] = [];

  for (const target of record.targets)
    await resolveTarget(adapters, state, record, target, bytes, server, now, reports);

  await saveState(adapters.home, state, adapters.now);

  if (record.entry) {
    await saveBase(record.base, bytes, adapters.now);
    await markAppliedEntry(adapters.home, record.entry, record.store, adapters.now);
  }

  return reports;
}

async function resolveTarget(
  adapters: TAdapters,
  state: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  record: Awaited<ReturnType<typeof conflictRecords>>[number],
  target: (typeof record.targets)[number],
  bytes: Uint8Array | undefined,
  server: Uint8Array | undefined,
  now: number,
  reports: string[],
) {
  const placed = await placeFileTarget(
    {
      adapters,
      state,
      options: {
        now: () => now,
        fetcher: adapters.fetcher,
        report: (message) => reports.push(message),
      },
    },
    target,
    bytes,
    record.entry
      ? p.decode(p.FileEntryCodec, binary(record.entry)).state === 1
      : server !== undefined,
  );

  if (!placed) return;

  const base = basePath(
    adapters.home,
    record.store,
    target.mode === "copy" ? target.root : undefined,
  );

  await saveBase(base, bytes, adapters.now);
}

async function recordDeletion(
  home: string,
  record: Awaited<ReturnType<typeof conflictRecords>>[number],
  bytes: Uint8Array | undefined,
  now: () => number,
) {
  await requestDeletion(
    home,
    record.store,
    bytes === undefined && (record.deleted || record.mineDeleted),
    record.entry ?? undefined,
    record.targets.map((target) => join(target.root, target.path)),
    now,
  );
}

function requireContent(bytes: Uint8Array | undefined) {
  if (bytes === undefined)
    throw new EnvdenError("INVALID_INPUT", "Recorded conflict content is missing");

  return bytes;
}
