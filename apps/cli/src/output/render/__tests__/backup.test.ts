import { expect, test } from "bun:test";
import { exportText } from "../backup.ts";

test("the summary names the count and the exact commands that open the file", () => {
  expect(
    exportText({ path: "/u/me/backups/env.age", files: 3, missing: 0, passphrase: true }, "/u/me"),
  ).toBe(
    [
      "Exported 3 env files from this device to ~/backups/env.age",
      "Open it into this folder without envden, using age or rage:",
      "  age -d ~/backups/env.age | tar -xf -",
    ].join("\n"),
  );

  expect(
    exportText({ path: "/mnt/it's here.age", files: 1, missing: 2, passphrase: false }, "/u/me"),
  ).toBe(
    [
      "Exported 1 env file from this device to /mnt/it's here.age",
      "Skipped 2 missing files",
      "Open it into this folder without envden, using age or rage and the key.txt identity for one recipient:",
      "  age -d -i key.txt '/mnt/it'\\''s here.age' | tar -xf -",
    ].join("\n"),
  );
});
