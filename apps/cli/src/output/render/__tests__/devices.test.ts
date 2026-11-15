import { expect, test } from "bun:test";
import { exposureText, pairedText, pairingText } from "../devices.ts";

test("removal lists what the device could read", () => {
  expect(exposureText({ files: [], incomplete: false })).toBe(
    "This device couldn't read any env files.",
  );

  expect(
    exposureText({ files: [{ repoId: "repo", path: ".env", keys: ["A", "B"] }], incomplete: true }),
  ).toBe(
    [
      "This device could read:",
      "  repo/.env: A, B",
      "It may have kept copies, so change these values where they're issued.",
      "Some history couldn't be read, so this list may be incomplete.",
    ].join("\n"),
  );
});

test("pairing tells the new device what to run", () => {
  expect(pairingText("https://envden.example", "1-ABCD-EFGH")).toBe(
    "On the new device run: envden join https://envden.example\nand enter code 1-ABCD-EFGH (valid 10 minutes). Keep this running.",
  );

  expect(pairedText("paired", "laptop")).toBe("Device laptop added");
  expect(pairedText("declined", "laptop")).toBe("Declined");
});
