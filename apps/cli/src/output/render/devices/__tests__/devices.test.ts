import { expect, test } from "bun:test";
import { exposureText, pairedText, pairingText } from "../devices.ts";

test("removal lists what the device could read", () => {
  expect(exposureText({ files: [], incomplete: false }).split("\n")).toHaveLength(1);

  const exposed = exposureText({
    files: [{ repoId: "repo", path: ".env", keys: ["A", "B"] }],
    incomplete: true,
  });

  expect(exposed).toContain("  repo/.env: A, B");
  expect(exposed).toContain("incomplete");
});

test("pairing tells the new device what to run", () => {
  const pairing = pairingText("https://envden.example", "1-ABCD-EFGH");

  expect(pairing).toContain("envden join https://envden.example");
  expect(pairing).toContain("1-ABCD-EFGH");
  expect(pairedText("paired", "laptop")).toContain("laptop");
  expect(pairedText("declined", "laptop")).not.toContain("laptop");
});
