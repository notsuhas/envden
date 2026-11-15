import type { Context } from "./context.ts";

export interface IResult {
  label: string;
  stdout: string;
  stderr: string;
  code: number;
}

export interface IDevice {
  home: string;
  checkout: string;
  env: Record<string, string>;
}

export interface IScenario {
  name: string;
  roles: string[];
  run: (context: Context) => Promise<void>;
}
