import { expect, test } from "bun:test";

import { kitFileName } from "../name.ts";

test.each([
  [1, "envden Recovery Kit GAV85N.pdf"],
  [2, "envden Recovery Kit GAV85N (2).pdf"],
  [10, "envden Recovery Kit GAV85N (10).pdf"],
])("copy %d is named %p", (copy, name) => {
  expect(kitFileName("GAV85NQ7XK", copy)).toBe(name);
});
