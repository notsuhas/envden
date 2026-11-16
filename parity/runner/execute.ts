import type { IIsolation } from "../isolation/tailscale.ts";
import { createContext, type TContext } from "../runtime/context.ts";
import type { IScenario } from "../scenarios/types.ts";
import { message } from "./message.ts";

export interface IExecution {
  context: TContext;
  observations: Record<string, string>;
  error?: unknown;
}

function binding(scenario: IScenario, roles: Record<string, string>) {
  return (role: string): string => {
    const binary = roles[role];
    if (!binary) throw new Error(`${scenario.name} uses role ${role} without declaring it`);

    return binary;
  };
}

async function runSteps(scenario: IScenario, context: TContext): Promise<unknown> {
  for (const step of scenario.steps) {
    try {
      await step.run(context);
    } catch (cause) {
      return new Error(`${step.name}: ${message(cause)}`);
    }
  }

  return undefined;
}

export async function execute(
  scenario: IScenario,
  roles: Record<string, string>,
  isolation: IIsolation,
  binaries: string[],
): Promise<IExecution> {
  const context = await createContext({ binary: binding(scenario, roles), binaries, isolation });
  const error = await runSteps(scenario, context);

  try {
    return { context, observations: await context.collect(scenario.files !== false), error };
  } catch (cause) {
    return { context, observations: {}, error: error ?? cause };
  }
}
