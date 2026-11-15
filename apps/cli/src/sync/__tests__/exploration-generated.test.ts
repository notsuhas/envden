import { afterAll, expect, test } from "bun:test";
import {
  WORKER_COUNT,
  startWorkers,
  stopWorkers,
  runWorker,
} from "./exploration/fixtures/workers.ts";
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

// Workers start while the file loads, so their key-derivation setup is outside the per-test limit.
await startWorkers();

afterAll(stopWorkers);

interface ITrace {
  layout: readonly ("copy" | "link")[];
  tokens: string[];
  label: string;
}

const cases: ITrace[] = [];

function register(layout: ITrace["layout"], tokens: string[], label = "exhaustive") {
  cases.push({ layout, tokens, label });
}

async function verifyTrace(scenario: ITrace, index: number) {
  const { layout, tokens } = scenario;
  const result = await runWorker(index, layout, tokens);

  expect({
    violations: result.violations,
    notes: result.notes,
    trace: result.violations.length ? result.trace : [],
  }).toEqual({ violations: [], notes: [], trace: [] });
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

for (let offset = 0; offset < cases.length; offset += WORKER_COUNT) {
  const batch = cases.slice(offset, offset + WORKER_COUNT);
  const name = batch
    .map(
      (scenario) => `${scenario.label} ${scenario.layout.join("+")} ${scenario.tokens.join(" ")}`,
    )
    .join(" | ");

  test(name, async () => {
    await Promise.all(batch.map(verifyTrace));
  });
}
