export interface ITurn {
  screen: string;
  prompts: string[];
  answer: string;
}

export interface IOutput {
  stdout: string;
  stderr: string;
  code: number;
  conversation?: ITurn[];
}

export interface IProcess {
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  input?: string | undefined;
}

export interface IAnswer {
  choices?: readonly string[];
  expect: string | RegExp;
  send: string;
}
