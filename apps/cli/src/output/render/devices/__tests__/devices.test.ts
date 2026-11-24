import { expect, test } from "bun:test";
import { approvalText, exposureText, noRequestText } from "../devices.ts";

test("removal lists what the device could read", () => {
  expect(exposureText({ files: [], incomplete: false }).split("\n")).toHaveLength(1);

  const exposed = exposureText({
    files: [{ repoId: "repo", path: ".env", keys: ["A", "B"] }],
    incomplete: true,
  });

  expect(exposed).toContain("  repo/.env: A, B");
  expect(exposed).toContain("incomplete");
});

test("approval tells the new device what to run and reports the outcome", () => {
  expect(noRequestText("https://envden.example")).toContain("envden join https://envden.example");
  expect(approvalText({ kind: "approved", name: "laptop" })).toBe("Device laptop added");
  expect(approvalText({ kind: "approved" })).toBe("Device added");
  expect(approvalText({ kind: "declined" })).toStartWith("Declined");
});
