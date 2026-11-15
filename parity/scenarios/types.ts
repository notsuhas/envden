import type { Context } from "../runtime/context.ts";

export interface IStep {
  name: string;
  run: (context: Context) => Promise<void>;
}
export interface IScenario {
  name: string;
  steps: IStep[];
}
