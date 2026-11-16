import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { assignments } from "./cli/assignments.ts";
import { parseRunOptions } from "./cli/options.ts";
import { probeIsolation } from "./isolation/probe.ts";
import { differences } from "./runner/diff.ts";
import { execute, type IExecution } from "./runner/execute.ts";
import { message } from "./runner/message.ts";
import { scenarioSkip } from "./runner/skip.ts";
import { scenarios } from "./scenarios/catalog.ts";

const options = parseRunOptions(process.argv.slice(2), (path) => resolve(path));
const binaries = [options.reference, options.candidate, ...(options.third ? [options.third] : [])];
const isolation = await probeIsolation();
const hostShims = process.env.PARITY_HOST_SHIMS === "1";

for (const name of options.scenarios)
  if (!scenarios.some((s) => s.name === name)) throw new Error(`Unknown scenario ${name}`);

const selected = scenarios.filter(
  (s) => options.scenarios.length === 0 || options.scenarios.includes(s.name),
);

const start = performance.now();
const seconds = (since: number) => `${((performance.now() - since) / 1000).toFixed(1)}s`;

let failed = 0;

let compared = 0;

let refused = 0;

console.log(`tailscale: ${isolation.tailscale}${isolation.deny ? " (sandboxed)" : ""}`);

async function report(name: string, baseline: IExecution, run: IExecution, since: number) {
  const errors = [baseline.error, run.error].filter(Boolean).map(message);
  const lines = [...errors, ...(await differences(baseline.observations, run.observations))];

  compared++;
  if (!lines.length) return console.log(`PASS ${name} (${seconds(since)})`);

  failed++;
  console.error([`FAIL ${name}`, ...lines].join("\n"));
}

for (const scenario of selected) {
  const skip = scenarioSkip(scenario, isolation, hostShims);

  if (skip) {
    console.log(`SKIP ${scenario.name}: ${skip}`);
    if (options.scenarios.includes(scenario.name)) refused++;
    continue;
  }

  const then = performance.now();
  const reference = Object.fromEntries(scenario.roles.map((role) => [role, options.reference]));
  const baseline = await execute(scenario, reference, isolation, binaries);

  try {
    for (const assignment of assignments(scenario.roles, options, options.mix)) {
      const since = performance.now();
      const run = await execute(scenario, assignment.roles, isolation, binaries);

      try {
        await report(`${scenario.name} [${assignment.name}]`, baseline, run, since);
        if (options.keep) console.log(`kept ${run.context.root}`);
      } finally {
        await run.context.cleanup(options.keep);
      }
    }
  } finally {
    if (options.keep) console.log(`kept ${scenario.name} reference: ${baseline.context.root}`);
    await baseline.context.cleanup(options.keep);
  }

  console.log(`  ${scenario.name} took ${seconds(then)}`);
}

console.log(`${compared - failed}/${compared} comparisons passed in ${seconds(start)}`);

process.exitCode = failed || refused ? 1 : 0;
