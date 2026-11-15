import { expect, test } from "bun:test";
import { conflictsText, resolvedText } from "../conflicts.ts";
import type { IConflictRecord } from "../../../sync/local/conflicts.ts";

const record = {
  root: "/repo",
  path: ".env",
  file: "/home/conflicts/ABC",
  deleted: false,
  mineDeleted: false,
} as IConflictRecord;

test("conflict list is readable and says when there are none", () => {
  expect(conflictsText([])).toBe("No conflicts");

  expect(conflictsText([record, { ...record, path: ".env.local", deleted: true }])).toBe(
    [
      "Conflicts:",
      "  /repo/.env\n    edit /home/conflicts/ABC",
      "  /repo/.env.local (deleted on the server)\n    edit /home/conflicts/ABC",
      "Edit the file, then run envden resolve <file>, or pass --keep-mine or --take-server",
    ].join("\n"),
  );
});

test("resolution names the file and where backups went", () => {
  const result = {
    kind: "resolved" as const,
    path: ".env",
    preserved: ["/b/1"],
    placementReports: ["Copied .env into /repo"],
    backups: "/home/conflicts/backups",
    savedBackups: [],
  };

  expect(resolvedText(result)).toBe(
    "Resolved .env\nCopied .env into /repo\nBackups saved in /home/conflicts/backups",
  );

  expect(resolvedText({ ...result, preserved: [], placementReports: [] })).toBe("Resolved .env");
});
