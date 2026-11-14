import { expect, test } from "bun:test";
import { isHighestRelease, validateTag } from "../version.ts";

test("only matching strict stable tags can start a release", () => {
  validateTag("v0.2.0", ["0.2.0", "0.2.0"]);

  for (const tag of ["v0.3.0-rc.1", "v01.2.0", "v1.2", "1.2.3", "v1.2.3+build", "v1.2.3\n"]) {
    expect(() => validateTag(tag, [])).toThrow();
  }

  expect(() => validateTag("v0.2.0", ["0.1.0"])).toThrow("mismatch");
});

test("backports cannot move current channels, while reruns can", () => {
  expect(isHighestRelease("v0.1.1", ["v0.2.0"])).toBe(false);
  expect(isHighestRelease("v0.2.0", ["v0.2.0", "v0.3.0-rc.1"])).toBe(true);
  expect(isHighestRelease("v0.10.0", ["v0.9.9"])).toBe(true);
  expect(isHighestRelease("v1.0.0", ["v0.99.99"])).toBe(true);
  expect(isHighestRelease("v0.2.0", [])).toBe(true);
});
