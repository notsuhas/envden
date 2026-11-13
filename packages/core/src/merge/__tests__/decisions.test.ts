import { expect, test } from "bun:test";
import { selectEntry } from "../selection.ts";
import { validateValue } from "../value.ts";
import type { IEnvEntry } from "../types.ts";

const entry = (value: string): IEnvEntry => ({
  key: "A",
  raw: Buffer.from(value),
  exported: false,
  quote: "",
  active: true,
});

const base = entry("A=1");
const edit = entry("A=2");

test.each([
  [base, base, base, "selected"],
  [base, edit, base, "selected"],
  [base, undefined, undefined, "selected"],
  [base, undefined, edit, "conflict"],
  [base, edit, edit, "conflict"],
  [base, { ...base, exported: true }, base, "conflict"],
] as const)(
  "selection preserves concurrent-edit rules %j %j %j",
  (original, mine, theirs, kind) => {
    expect(selectEntry("A", original, mine, theirs).kind).toBe(kind);
  },
);

test.each([
  ["'ok'", "'", "", "valid"],
  ["'open", "'", "", "conflict"],
  ["'open", "'", "later'", "conflict"],
  ["'ok' extra", "'", "", "conflict"],
  ["value\\", "", "", "conflict"],
] as const)("value validation %s", (value, quote, remaining, kind) => {
  expect(validateValue(value, quote, "A", remaining).kind).toBe(kind);
});
