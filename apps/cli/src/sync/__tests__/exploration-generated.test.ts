import { afterAll, expect, test } from "bun:test";
import { run } from "./exploration/run.ts";
import { shutdown } from "./exploration/fixture.ts";
import { randomTraces, sequences } from "./exploration/drivers/generated.ts";

// ENVDEN_DEEP_EXPLORATION=1 adds depth-four traces and 600 seeded random traces.
const deep = process.env.ENVDEN_DEEP_EXPLORATION === "1";
const alphabet = ["a", "r", "Al", "Be", "Br", "Bl", "Bs", "Bx", "Bf", "Bm", "Bk", "Bt", "Bu"];
const layouts = [["copy"], ["copy", "copy"], ["link"], ["link", "copy"]] as const;

afterAll(shutdown);

function register(layout: readonly ("copy" | "link")[], tokens: string[], label = "exhaustive") {
  test(`${label} ${layout.join("+")} ${tokens.join(" ")}`, async () => {
    const result = await run(layout, tokens);

    expect({
      violations: result.violations,
      notes: result.notes,
      trace: result.violations.length ? result.trace : [],
    }).toEqual({ violations: [], notes: [], trace: [] });
  });
}

for (const layout of layouts) for (const tokens of sequences(alphabet, 1)) register(layout, tokens);

if (deep) {
  for (const tokens of sequences(alphabet, 2)) register(["copy"], tokens, "deep-pair");
  for (const [index, { layout, tokens }] of randomTraces(600).entries())
    register(layout, tokens, `seed-1-${String(index).padStart(3, "0")}`);
  for (const layout of layouts)
    for (const tokens of sequences(["a", "Be", "Bx", "Bf"], 4)) register(layout, tokens, "deep");
}
