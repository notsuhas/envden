import { join } from "node:path";
import { sanitizeConsole } from "../../sanitize.ts";
import type { IConflictRecord } from "../../../sync/local/conflicts.ts";
import type { resolveConflict } from "../../../sync/resolve.ts";

interface IConflictNotice {
  path: string;
  file: string;
  device?: string;
  keys?: readonly string[];
  marked: boolean;
  mine: "live" | "deleted";
  theirs: "live" | "tombstone" | "absent";
}

export function conflictNotice(notice: IConflictNotice) {
  const { path, file } = notice;

  const next = notice.marked
    ? `Edit ${file}, then run envden resolve ${path}`
    : `Run envden resolve ${path} with --keep-mine or --take-server, or edit ${file} first`;

  return `Conflict in ${path}: ${conflictCause(notice)}. ${next}`;
}

function conflictCause(notice: IConflictNotice) {
  const where = notice.device ?? "the server";

  if (notice.theirs === "absent") return "this device has two different versions";
  if (notice.theirs === "tombstone") return `deleted on ${where} and changed here`;
  if (notice.mine === "deleted") return `deleted here and changed on ${where}`;
  if (notice.keys?.length) return `${notice.keys.join(", ")} changed here and on ${where}`;

  return `changed here and on ${where}`;
}

export function conflictsText(records: IConflictRecord[]) {
  if (!records.length) return "No conflicts";

  const lines = records.map((record) =>
    [
      `  ${join(record.root, record.path)}${sideNote(record)}`,
      `    edit ${record.file}`,
      ...record.alternatives.map((path) => `    saved ${savedSource(record, path)}: ${path}`),
    ].join("\n"),
  );

  return sanitizeConsole(
    [
      "Conflicts:",
      ...lines,
      "Edit the file, then run envden resolve <file>, or pass --keep-mine or --take-server",
    ].join("\n"),
  );
}

export function resolvedText(result: Awaited<ReturnType<typeof resolveConflict>>) {
  return sanitizeConsole(
    [
      `Resolved ${result.path}`,
      ...result.placementReports,
      ...(result.preserved.length ? [`Backups saved in ${result.backups}`] : []),
    ].join("\n"),
  );
}

// Variants are saved in order: the store, the server, then each target.
function savedSource(record: IConflictRecord, path: string) {
  const index = Number(/\.variant-(\d+)$/.exec(path)?.[1]);
  if (index === 0) return "this device";
  if (index === 1) return "server";
  const target = record.targets[index - 2];

  return target ? join(target.root, record.path) : "copy";
}

function sideNote(record: IConflictRecord) {
  if (record.deleted) return " (deleted on the server)";

  return record.mineDeleted ? " (deleted here)" : "";
}
