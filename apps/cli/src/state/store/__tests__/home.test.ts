import { expect, test } from "bun:test";
import { join } from "node:path";
import { envdenHome } from "../home.ts";

test("ENVDEN_HOME picks the home; unset or empty means ~/.envden", () => {
  expect(envdenHome("/custom", "/u")).toBe("/custom");
  expect(envdenHome(undefined, "/u")).toBe(join("/u", ".envden"));
  expect(envdenHome("", "/u")).toBe(join("/u", ".envden"));
});
