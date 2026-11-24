import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnTrusted } from "@envden/core/process";

const workflow = readFileSync(
  new URL("../../../../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

const validation = workflow.split("\n").find((line) => line.includes('if ! [[ "$IMAGE_DIGEST"'));

test("release validates the digest before writing its artifact", () => {
  expect(validation).toBeDefined();
  expect(workflow.indexOf(validation!)).toBeLessThan(workflow.indexOf(" > release/IMAGE_DIGEST"));
});

for (const digest of [
  "",
  "sha256:" + "a".repeat(63),
  "sha256:" + "g".repeat(64),
  "sha256:" + "a".repeat(64),
])
  test(`image digest format: ${digest.length}`, () => {
    expect(validation).toBeDefined();

    const result = spawnTrusted("bash", ["-c", validation!], {
      sync: true,
      env: { IMAGE_DIGEST: digest },
    });

    expect(result.exitCode === 0).toBe(digest === "sha256:" + "a".repeat(64));
  });
