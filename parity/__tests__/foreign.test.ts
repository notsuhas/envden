import { expect, test } from "bun:test";
import { isForeignCache } from "../runtime/foreign.ts";

test("only other tools' caches are compared by presence", () => {
  expect(isForeignCache("a/home/.cache/powershell/StartupProfileData-NonInteractive")).toBe(true);
  expect(isForeignCache("a/home/app/.env")).toBe(false);
  expect(isForeignCache("a/envden/state/cache/powershell.json")).toBe(false);
});
