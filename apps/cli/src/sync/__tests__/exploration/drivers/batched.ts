import { afterAll, expect, test } from "bun:test";
import { WORKER_COUNT, startWorkers, stopWorkers, runWorker } from "../fixtures/workers.ts";

export interface ITrace {
  layout: readonly ("copy" | "link")[];
  tokens: string[];
  label: string;
}

async function verifyTrace(scenario: ITrace, index: number) {
  const result = await runWorker(index, scenario.layout, scenario.tokens);

  expect({
    violations: result.violations,
    notes: result.notes,
    trace: result.violations.length ? result.trace : [],
  }).toEqual({ violations: [], notes: [], trace: [] });
}

// Workers start while the file loads, so their key-derivation setup is outside the per-test limit.
export async function testTraces(cases: ITrace[]) {
  await startWorkers();
  afterAll(stopWorkers);

  for (let offset = 0; offset < cases.length; offset += WORKER_COUNT) {
    const batch = cases.slice(offset, offset + WORKER_COUNT);

    const name = batch
      .map(({ label, layout, tokens }) => `${label} ${layout.join("+")} ${tokens.join(" ")}`)
      .join(" | ");

    test(name, async () => {
      await Promise.all(batch.map(verifyTrace));
    });
  }
}
