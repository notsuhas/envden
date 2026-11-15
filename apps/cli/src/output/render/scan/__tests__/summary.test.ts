import { test, expect } from "bun:test";
import { skippedSummary } from "../summary.ts";

test("the skipped summary names each nonzero count once", () => {
  expect(skippedSummary({}, "envden setup")).toBeUndefined();

  expect(skippedSummary({ remote: 9, ownLinks: 14 }, "envden setup")).toBe(
    "Skipped 9 repos without a usable git remote and 14 env files that are your own symlinks. Run envden setup --verbose to list them.",
  );

  expect(skippedSummary({ remote: 2, identity: 1 }, "envden track")).toBe(
    "Skipped 2 repos without a usable git remote and 1 repo envden couldn't identify. Run envden track --verbose to list them.",
  );

  expect(skippedSummary({ ownLinks: 1 }, "envden setup")).toBe(
    "Skipped 1 env file that is your own symlink. Run envden setup --verbose to list it.",
  );
});
