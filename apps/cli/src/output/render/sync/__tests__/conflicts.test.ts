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

test("conflict list names each file, its edit file and saved variants", () => {
  expect(conflictsText([])).toMatch(/no conflicts/i);

  const saved = {
    ...record,
    path: ".env.local",
    deleted: true,
    alternatives: ["/c/ABC.variant-1", "/c/ABC.variant-2"],
  };

  const text = conflictsText([record, saved]);

  for (const line of [
    "  /repo/.env\n    edit /home/conflicts/ABC",
    "  /repo/.env.local (deleted on the server)",
    "    saved server: /c/ABC.variant-1",
    "    saved /other/.env.local: /c/ABC.variant-2",
  ])
    expect(text).toContain(line);

  expect(text).toContain("envden resolve");
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

  const text = resolvedText(result);

  expect(text).toContain(".env");
  expect(text).toContain("Copied .env into /repo");
  expect(text).toContain("/home/conflicts/backups");

  expect(resolvedText({ ...result, preserved: [], placementReports: [] }).split("\n")).toHaveLength(
    1,
  );
});

test("a conflict notice is one line naming the cause and the next step", () => {
  const notice = {
    path: "app/.env",
    file: "/c/ABC",
    marked: true,
    mine: "live",
    theirs: "live",
  } as const;

  const keys = conflictNotice({ ...notice, keys: ["TOKEN"], device: "laptop" });
  const deleted = conflictNotice({ ...notice, marked: false, mine: "deleted" });

  expect(keys).toMatch(
    /^Conflict in app\/\.env: TOKEN .*laptop.*Edit \/c\/ABC.*envden resolve app\/\.env$/,
  );

  expect(conflictNotice(notice)).toContain("the server");
  expect(deleted).toContain("deleted here");
  expect(deleted).toContain("--keep-mine or --take-server");
  expect(deleted.split("\n")).toHaveLength(1);
});
