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

    const destination = join(record.root, record.path);
    const placement = adapters.placement(record.mode, record.root);
    const status = await placement.inspect(record.store, destination);

    const bytes = await resolutionBytes(options.choice, record, server, status);

    await backup(adapters.home, record.store, now);
    await writeBytes(record.store, bytes);

    if (status !== "linked") await backup(adapters.home, destination, now);

    if (bytes) await placement.place(record.store, destination);
    else await placement.remove(record.store, destination);

    if (!bytes) await removeResolvedLink(adapters.home, record.root, record.path);

    await saveBase(record.base, server, now);
    await saveAgreement(adapters.home, record, bytes, now);

    await saveConflicts(
      adapters.home,
      records.filter((item) => item !== record),
    );

    for (const path of [record.file, record.server, record.mine]) await rm(path, { force: true });

    return { kind: "resolved" as const, path: record.path };
  });
}

async function resolutionBytes(
  choice: "keep-mine" | "take-server" | "edit",
  record: Awaited<ReturnType<typeof conflictRecords>>[number],
  server: Uint8Array | undefined,
  status: string,
) {
  if (choice === "take-server") return server;
  if (choice === "edit") return readBytes(record.file);

  return readBytes(
    record.mode === "link" && status === "linked" ? record.store : join(record.root, record.path),
  );
}

async function removeResolvedLink(home: string, root: string, path: string) {
  const state = await loadState(home);
  if (!state) return;
  state.links = state.links.filter((item) => item.root !== root || item.path !== path);
  await saveState(home, state);
}

function matchesConflict(
  item: Awaited<ReturnType<typeof conflictRecords>>[number],
  options: { repo?: string; file?: string },
) {
  if (options.repo && item.root !== resolve(options.repo)) return false;
  if (!options.file) return true;

  return (
    item.path === options.file ||
    item.file === options.file ||
    resolve(options.file) === join(item.root, item.path)
  );
}

async function saveAgreement(
  home: string,
  record: Awaited<ReturnType<typeof conflictRecords>>[number],
  bytes: Uint8Array | undefined,
  now: number,
) {
  if (record.entry) await markAppliedEntry(home, record.entry);
  else if (record.mode === "copy") await saveBase(record.base + ".unpublished", bytes, now);
}
