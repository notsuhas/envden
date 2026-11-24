import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { verifyReleaseChecksums } from "../verify.ts";

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
  const resigned = sums.replace(
    /^[a-f0-9]{64}(?=  envden-darwin-arm64\.tar\.gz$)/m,
    "f".repeat(64),
  );

  const relinked = sums.replace(/^[a-f0-9]{64}(?=  envden-linux-x64\.tar\.gz$)/m, "f".repeat(64));

  expect(resigned).not.toBe(sums);
  expect(() => verifyReleaseChecksums(sums, resigned, false)).toThrow("Re-run only failed jobs");
  expect(() => verifyReleaseChecksums(sums, resigned, true)).not.toThrow();
  expect(() => verifyReleaseChecksums(sums, relinked, true)).toThrow("Re-run only failed jobs");
});
