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

    const matches = records.filter(
      (item) =>
        (!options.repo || item.root === resolve(options.repo)) &&
        (!options.file ||
          item.path === options.file ||
          item.file === options.file ||
          resolve(options.file) === join(item.root, item.path)),
    );

    if (matches.length !== 1)
      throw new EnvdenError("INVALID_INPUT", "Name exactly one conflict file");

    const record = matches[0]!;
    const server = record.deleted ? undefined : await readBytes(record.server);

    const bytes = await resolutionBytes(options.choice, record, server);

    await backup(adapters.home, record.store, (options.now ?? Date.now)());
    await writeBytes(record.store, bytes);
    const destination = join(record.root, record.path);

    const placement = adapters.placement(record.mode, record.root);
    const status = await placement.inspect(record.store, destination);
    if (status !== "linked") await backup(adapters.home, destination, (options.now ?? Date.now)());

    if (bytes) await placement.place(record.store, destination);
    else if (
      record.mode === "copy" ||
      (await adapters.placement(record.mode, record.root).inspect(record.store, destination)) ===
        "linked"
    )
      await placement.remove(record.store, destination);

    await saveBase(record.base, server);

    await saveConflicts(
      adapters.home,
      records.filter((item) => item !== record),
    );

    return { kind: "resolved" as const, path: record.path };
  });
}

async function resolutionBytes(
  choice: "keep-mine" | "take-server" | "edit",
  record: Awaited<ReturnType<typeof conflictRecords>>[number],
  server: Uint8Array | undefined,
) {
  return choice === "take-server"
    ? server
    : choice === "edit"
      ? await readBytes(record.file)
      : record.mineDeleted
        ? undefined
        : await readBytes(record.mine);
}
