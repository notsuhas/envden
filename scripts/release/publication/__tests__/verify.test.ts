import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { verifyReleaseChecksums, verifyNpmChecksums } from "../verify.ts";
import { assetName, targets } from "../../../../apps/cli/scripts/targets.ts";
import { parseChecksums } from "../../channels/render.ts";

const sums = readFileSync(new URL("../../channels/__tests__/SHA256SUMS", import.meta.url), "utf8");

test("published assets allow identical retries and reject rebuilds", () => {
  expect(() =>
    verifyReleaseChecksums(sums, sums.split("\n").reverse().join("\n").trim(), false),
  ).not.toThrow();

  expect(() =>
    verifyReleaseChecksums(sums, sums.replace(/^[a-f0-9]{64}/, "f".repeat(64)), false),
  ).toThrow("Re-run only failed jobs");

  expect(() => verifyReleaseChecksums(sums, "", false)).toThrow();
});

test("signed macOS rebuilds skip only the darwin comparison", () => {
  const resigned = sums.replace(/^[a-f0-9]{64}(?=  envden-darwin-arm64$)/m, "f".repeat(64));
  const relinked = sums.replace(/^[a-f0-9]{64}(?=  envden-linux-x64$)/m, "f".repeat(64));

  expect(resigned).not.toBe(sums);
  expect(() => verifyReleaseChecksums(sums, resigned, false)).toThrow("Re-run only failed jobs");
  expect(() => verifyReleaseChecksums(sums, resigned, true)).not.toThrow();
  expect(() => verifyReleaseChecksums(sums, relinked, true)).toThrow("Re-run only failed jobs");
});

test("existing npm versions must pin the published release", () => {
  const hashes = parseChecksums(sums);

  const pinned = Object.fromEntries(
    targets.map((target) => [target, hashes.get(assetName(target))]),
  );

  expect(() => verifyNpmChecksums(pinned, sums)).not.toThrow();

  expect(() => verifyNpmChecksums({ ...pinned, "linux-x64": "f".repeat(64) }, sums)).toThrow(
    "new version",
  );

  expect(() => verifyNpmChecksums({}, sums)).toThrow();
});
