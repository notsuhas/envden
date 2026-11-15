import { testTraces, type ITrace } from "./exploration/drivers/batched.ts";
import { randomTraces, sequences } from "./exploration/drivers/generated.ts";

// ENVDEN_DEEP_EXPLORATION=1 adds depth-four traces and 600 seeded random traces.
const deep = process.env.ENVDEN_DEEP_EXPLORATION === "1";

const alphabet = [
  "a",
  "r",
  "Al",
  "Be",
  "Br",
  "Bl",
  "Bs",
  "Bx",
  "Bf",
  "Bm",
  "Bk",
  "Bt",
  "Bu",
  "Bdel",
  "Bstore",
  "Bn",
  "Bq",
  "Btmp",
  "Bcorrupt",
  "Bv",
  "Br=earlier",
  "Bd",
  "Bd=zz",
  "Bz",
  "By",
  "Be1",
  "Br1",
  "Bf0",
  "Bz1",
  "By1",
  "Bv1",
];

const layouts = [["copy"], ["copy", "copy"], ["link"], ["link", "copy"]] as const;

const cases: ITrace[] = [];

function register(layout: ITrace["layout"], tokens: string[], label = "exhaustive") {
  cases.push({ layout, tokens, label });
}

for (const layout of layouts)
  for (const tokens of sequences(alphabet.slice(0, 13), 1)) register(layout, tokens);

for (const tokens of sequences(alphabet, 2)) register(["copy", "link"], tokens);

if (deep) {
  for (const [index, { layout, tokens }] of randomTraces(600).entries())
    register(layout, tokens, `seed-1-${String(index).padStart(3, "0")}`);
  for (const layout of layouts)
    for (const tokens of sequences(["a", "Be", "Bx", "Bf"], 4)) register(layout, tokens, "deep");
}

await testTraces(cases);
