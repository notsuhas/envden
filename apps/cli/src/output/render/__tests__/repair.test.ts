import { expect, test } from "bun:test";
import { repairText } from "../repair.ts";

test("each repair outcome reads as a sentence", () => {
  expect(repairText({ kind: "missing-reports", devices: ["laptop", "desktop"] })).toStartWith(
    "Waiting for laptop, desktop to run envden server repair.",
  );

  expect(
    repairText({
      kind: "missing-blobs",
      missing: [],
      lost: [{ repoId: "repo", path: ".env" }],
    }),
  ).toBe(
    "No device has the newest version of repo/.env.\nCheck those files, then finish with --accept-lost to use the newest older version.",
  );

  expect(repairText({ kind: "finished", report: undefined, replaceKit: false })).toBe(
    "Server restore finished",
  );

  expect(repairText({ kind: "finished", report: "repo/.env: lost", replaceKit: true })).toBe(
    "Server restore finished\n\nrepo/.env: lost\nThe restored server can't vouch for the current recovery kit; replace it.",
  );
});
