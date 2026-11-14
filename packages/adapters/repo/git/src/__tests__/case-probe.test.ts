import { expect, test } from "bun:test";
import { caseProbe } from "../checkout/case-probe.ts";

test("case probes use an existing spelling and distinguish listed aliases", () => {
  expect(caseProbe(["123", ".git"])).toEqual({ kind: "compare", name: ".git", alternate: ".Git" });
  expect(caseProbe(["abc", "Abc"])).toEqual({ kind: "sensitive" });
  expect(caseProbe(["123"])).toEqual({ kind: "empty" });
});
