import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createContext, type TContext } from "./runtime/context.ts";
import { differences } from "./runtime/diff.ts";
import { moveScenarios } from "./scenarios/move.ts";
import { errorScenarios } from "./scenarios/maintenance/errors.ts";
import { probe } from "./scenarios/maintenance/probe.ts";
import { repairScenarios } from "./scenarios/repair.ts";
import { fileScenarios } from "./scenarios/files.ts";
import { adminScenarios } from "./scenarios/admin.ts";
import { basicScenarios } from "./scenarios/maintenance/basic.ts";
import { syncScenarios } from "./scenarios/sync.ts";
import type { IScenario } from "./scenarios/types.ts";

const options = {
  reference: "",
  candidate: "",
  server: "",
  keep: false,
  scenarios: new Set<string>(),
  devices: new Map<string, string>(),
};

const args = process.argv.slice(2);

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--keep") {
    options.keep = true;
    continue;
  }
  const value = args[++i];
  if (!value) throw new Error(`Missing value for ${arg}`);
  if (arg === "--reference") options.reference = resolve(value);
  else if (arg === "--candidate") options.candidate = resolve(value);
  else if (arg === "--server-binary") options.server = resolve(value);
  else if (arg === "--scenario") options.scenarios.add(value);
  else if (arg === "--device-binary") {
    const separator = value.indexOf("=");
    if (separator < 1) throw new Error("Use --device-binary device=path");
    options.devices.set(value.slice(0, separator), resolve(value.slice(separator + 1)));
  } else throw new Error(`Unknown option ${arg}`);
}

if (!options.reference || !options.candidate)
  throw new Error(
    "Usage: bun parity/run.ts --reference <bin> --candidate <bin> [--scenario <name>] [--keep] [--server-binary <bin>] [--device-binary a=<bin>]",
  );

const all = [
  probe,
  ...basicScenarios,
  ...syncScenarios,
  ...fileScenarios,
  ...adminScenarios,
  ...repairScenarios,
  ...errorScenarios,
  ...moveScenarios,
];

for (const name of options.scenarios)
  if (!all.some((s) => s.name === name)) throw new Error(`Unknown scenario ${name}`);

const selected = all.filter((s) => options.scenarios.size === 0 || options.scenarios.has(s.name));
const start = performance.now();

let failed = 0;

async function execute(scenario: IScenario, binary: string) {
  const context = await createContext(binary, serverBinary(binary), options.devices);
  let error: unknown;

  try {
    await runSteps(scenario, context);
  } catch (cause) {
    error = cause;
  }

  let observations: Record<string, string> = {};

  try {
    observations = await context.collect();
  } catch (cause) {
    error ??= cause;
  }

  return { context, observations, error };
}

for (const scenario of selected) {
  const then = performance.now();
  const reference = await execute(scenario, options.reference);
  const candidate = await execute(scenario, options.candidate);
  try {
    const diffs = await differences(reference.observations, candidate.observations);
    const errors = [reference.error, candidate.error].filter(Boolean);
    if (diffs.length || errors.length) {
      failed++;
      console.error(`FAIL ${scenario.name}`);
      for (const error of errors) console.error(error instanceof Error ? error.message : error);
      for (const diff of diffs) console.error(diff);
    } else
      console.log(`PASS ${scenario.name} (${((performance.now() - then) / 1000).toFixed(1)}s)`);
    if (options.keep)
      console.log(
        `kept ${scenario.name}: reference=${reference.context.root} candidate=${candidate.context.root}`,
      );
  } finally {
    await reference.context.cleanup(options.keep);
    await candidate.context.cleanup(options.keep);
  }
}

console.log(
  `${selected.length - failed}/${selected.length} scenarios passed in ${((performance.now() - start) / 1000).toFixed(1)}s`,
);

process.exitCode = failed ? 1 : 0;

async function runSteps(scenario: IScenario, context: TContext): Promise<void> {
  for (const step of scenario.steps) {
    try {
      await step.run(context);
    } catch (cause) {
      throw new Error(`${step.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
}

function serverBinary(binary: string): string {
  return options.server || binary;
}
