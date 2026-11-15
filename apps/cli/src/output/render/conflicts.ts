import { join } from "node:path";
import { sanitizeConsole } from "../sanitize.ts";
import type { IConflictRecord } from "../../sync/local/conflicts.ts";
import type { resolveConflict } from "../../sync/resolve.ts";

export function conflictsText(records: IConflictRecord[]) {
  if (!records.length) return "No conflicts";

  const lines = records.map(
    (record) => `  ${join(record.root, record.path)}${sideNote(record)}\n    edit ${record.file}`,
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

function sideNote(record: IConflictRecord) {
  if (record.deleted) return " (deleted on the server)";

  return record.mineDeleted ? " (deleted here)" : "";
}
