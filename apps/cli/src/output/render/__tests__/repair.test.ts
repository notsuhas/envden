import { expect, test } from "bun:test";
import { repairText } from "../repair.ts";

test("each repair outcome names who or what it waits for and the next step", () => {
  const waiting = repairText({ kind: "missing-reports", devices: ["laptop", "desktop"] });

  expect(waiting).toContain("laptop, desktop");
  expect(waiting).toContain("envden server repair");

  const lost = repairText({
    kind: "missing-blobs",
    missing: [],
    lost: [{ repoId: "repo", path: ".env" }],
  });

  expect(lost).toContain("repo/.env");
  expect(lost).toContain("--accept-lost");
  expect(lost).not.toContain("Waiting");

  const plain = repairText({ kind: "finished", report: undefined, replaceCode: false });
  const code = repairText({ kind: "finished", report: "repo/.env: lost", replaceCode: true });

  expect(plain.split("\n")).toHaveLength(1);
  expect(code).toStartWith(plain);
  expect(code).toContain("repo/.env: lost");
  expect(code).toContain("recovery code");
});
