import type { IPrompt } from "./terminal/prompts.ts";
import type { Context } from "./context.ts";

export interface IResult {
  label: string;
  stdout: string;
  stderr: string;
  code: number;
  prompts?: IPrompt[];
  args?: string[];
}

export interface IDevice {
  home: string;
  checkout: string;
  env: Record<string, string>;
}

export interface IScenario {
  snapshot?: "output";
  name: string;
  roles: string[];
  run: (context: Context) => Promise<void>;
}
