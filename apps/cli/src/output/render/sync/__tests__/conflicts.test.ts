import { expect, test } from "bun:test";
import { conflictNotice, conflictsText, resolvedText } from "../conflicts.ts";
import type { IConflictRecord } from "../../../../sync/local/conflicts.ts";

const record = {
  root: "/repo",
  path: ".env",
  file: "/home/conflicts/ABC",
  alternatives: [] as string[],
  targets: [{ root: "/other" }],
  deleted: false,
  mineDeleted: false,
} as IConflictRecord;

test("conflict list is readable and says when there are none", () => {
  expect(conflictsText([])).toBe("No conflicts");

  const saved = {
    ...record,
    path: ".env.local",
    deleted: true,
    alternatives: ["/c/ABC.variant-1", "/c/ABC.variant-2"],
  };

  expect(conflictsText([record, saved])).toBe(
    [
      "Conflicts:",
      "  /repo/.env\n    edit /home/conflicts/ABC",
      "  /repo/.env.local (deleted on the server)\n    edit /home/conflicts/ABC\n    saved server: /c/ABC.variant-1\n    saved /other/.env.local: /c/ABC.variant-2",
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

test("a conflict notice is one line naming the cause and the next step", () => {
  const notice = {
    path: "app/.env",
    file: "/c/ABC",
    marked: true,
    mine: "live",
    theirs: "live",
  } as const;

  const edit = "Edit /c/ABC, then run envden resolve app/.env";

  for (const [extra, expected] of [
    [{ keys: ["TOKEN"], device: "laptop" }, `TOKEN changed here and on laptop. ${edit}`],
    [{}, `changed here and on the server. ${edit}`],
    [
      { marked: false, mine: "deleted" },
      "deleted here and changed on the server. Run envden resolve app/.env with --keep-mine or --take-server, or edit /c/ABC first",
    ],
  ] as const)
    expect(conflictNotice({ ...notice, ...extra })).toBe(`Conflict in app/.env: ${expected}`);
});
