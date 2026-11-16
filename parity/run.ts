import { scenarios } from "./catalog.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { difference } from "./harness/diff.ts";
import { Context } from "./harness/context.ts";
import { capture } from "./harness/snapshot.ts";
import type { IScenario } from "./harness/types.ts";

const implementations: { name: string; command: string[] }[] = [];

let filter = "";

let mix = false;

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--mix") mix = true;
  else if (arg === "--filter") filter = process.argv[++i] ?? "";
  else if (arg === "--impl") {
    const input = process.argv[++i] ?? "";
    const equal = input.indexOf("=");
    if (equal < 1) throw new Error("Expected --impl name=command");
    const command = input
      .slice(equal + 1)
      .trim()
      .split(/\s+/);
    command[0] = Bun.which(command[0]!) ?? resolve(command[0]!);
    implementations.push({ name: input.slice(0, equal), command });
  } else throw new Error(`Unknown argument ${arg}`);
}

if (implementations.length < 2)
  throw new Error("Give at least two --impl name=command arguments; first is the reference");

async function run(scenario: IScenario, assignment: Record<string, string[]>) {
  const root = await mkdtemp(join(tmpdir(), "envden-parity-"));
  const c = new Context(root, assignment);

  try {
    await scenario.run(c);
    await c.close();

    return await capture(c, scenario.snapshot !== "output");
  } finally {
    await c.close();

    if (process.env.PARITY_KEEP) console.log(`kept ${root}`);
    else await rm(root, { recursive: true, force: true });
  }
}

let failures = 0;

let count = 0;

for (const scenario of scenarios) {
  if (!scenario.name.includes(filter)) continue;
  count++;
  try {
    const baseline = await run(
      scenario,
      Object.fromEntries(scenario.roles.map((role) => [role, implementations[0]!.command])),
    );
    const assignments = implementations.slice(1).map((impl) => ({
      name: impl.name,
      roles: Object.fromEntries(scenario.roles.map((role) => [role, impl.command])),
    }));
    if (mix)
      for (const impl of implementations.slice(1))
        for (const selected of scenario.roles)
          assignments.push({
            name: `${impl.name}@${selected}`,
            roles: Object.fromEntries(
              scenario.roles.map((role) => [
                role,
                role === selected ? impl.command : implementations[0]!.command,
              ]),
            ),
          });
    for (const assignment of assignments) {
      const actual = await run(scenario, assignment.roles);
      if (actual !== baseline) {
        throw new Error(await difference(baseline, actual, assignment.name));
      }
      console.log(`PASS ${scenario.name} (${assignment.name})`);
    }
  } catch (error) {
    failures++;
    console.error(
      `FAIL ${scenario.name}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (!count) throw new Error(`No scenarios match ${filter}`);

console.log(`${count - failures}/${count} scenarios passed`);

process.exitCode = failures ? 1 : 0;
