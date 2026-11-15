import { test, expect } from "bun:test";
import { skippedSummary } from "../summary.ts";

test("the skipped summary names each nonzero count once and the verbose command", () => {
  expect(skippedSummary({}, "envden setup")).toBeUndefined();

  const many = skippedSummary({ remote: 9, ownLinks: 14 }, "envden setup")!;

  expect(many).toMatch(/9 repos .* and 14 env files /);
  expect(many).not.toContain("identify");
  expect(many).toContain("envden setup --verbose");
  expect(skippedSummary({ remote: 2, identity: 1 }, "envden track")).toContain("1 repo envden");
  expect(skippedSummary({ ownLinks: 1 }, "envden setup")).toMatch(/^Skipped 1 env file [^.]*\./);
});
