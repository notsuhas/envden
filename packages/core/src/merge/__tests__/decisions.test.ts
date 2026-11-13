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

test("selection preserves concurrent-edit rules", () => {
  for (const [original, mine, theirs, kind] of [
    [base, base, base, "selected"],
    [base, edit, base, "selected"],
    [base, undefined, undefined, "selected"],
    [base, undefined, edit, "conflict"],
    [base, edit, edit, "conflict"],
    [base, { ...base, exported: true }, base, "conflict"],
  ] as const)
    expect(selectEntry("A", original, mine, theirs).kind).toBe(kind);
});

test("value validation", () => {
  for (const [value, quote, remaining, kind] of [
    ["'ok'", "'", "", "valid"],
    ["'open", "'", "", "conflict"],
    ["'open", "'", "later'", "conflict"],
    ["'ok' extra", "'", "", "conflict"],
    ["value\\", "", "", "conflict"],
  ] as const)
    expect(validateValue(value, quote, "A", remaining).kind).toBe(kind);
});
