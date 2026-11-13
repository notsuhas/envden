import { expect, test } from "bun:test";
import { classifyUnknownData } from "../unknown/classify.ts";
import { bytes } from "./fixtures.ts";

test("unknown-data classification compares bytes before signature before format", () => {
  const input = {
    received: bytes(1),
    stored: bytes(2),
    mismatch: "fork",
    verify: () => {
      throw new Error("must not run before comparison");
    },
    unknownFormat: true,
    currentVersion: "1.0.0",
    latestVersion: "2.0.0",
  } as const;

  expect(classifyUnknownData(input).kind).toBe("fork");
  expect(classifyUnknownData({ ...input, mismatch: "rollback" }).kind).toBe("rollback");
  expect(classifyUnknownData({ ...input, stored: bytes(1) }).kind).toBe("invalid");

  expect(classifyUnknownData({ ...input, stored: undefined, verify: () => false }).kind).toBe(
    "invalid",
  );

  expect(classifyUnknownData({ ...input, stored: undefined, verify: () => true }).kind).toBe(
    "update-required",
  );

  expect(
    classifyUnknownData({
      ...input,
      stored: undefined,
      verify: () => true,
      currentVersion: "2.0.0",
    }).kind,
  ).toBe("unreadable");

  expect(
    classifyUnknownData({ ...input, stored: undefined, verify: () => true, unknownFormat: false })
      .kind,
  ).toBe("known");
});
