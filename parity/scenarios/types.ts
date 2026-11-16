import type { TContext } from "../runtime/context.ts";

export interface IStep {
  name: string;
  run: (context: TContext) => Promise<void>;
}

export interface IScenario {
  name: string;
  steps: IStep[];
}
