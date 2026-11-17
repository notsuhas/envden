import { type IShard, parseShard } from "./shard.ts";

export interface IRunOptions {
  reference: string;
  candidate: string;
  third?: string;
  scenarios: string[];
  keep: boolean;
  mix: boolean;
  shard?: IShard;
}

const USAGE =
  "Usage: bun parity/run.ts --reference <envden> --candidate <envden> [--scenario <name>]... [--keep] [--mix [--third <envden>]] [--shard <i>/<n>]";

type TSetter = (options: IRunOptions, value: string, absolute: (path: string) => string) => void;

const SWITCHES: Record<string, "keep" | "mix"> = { "--keep": "keep", "--mix": "mix" };

const VALUES: Record<string, TSetter> = {
  "--reference": (o, v, absolute) => (o.reference = absolute(v)),
  "--candidate": (o, v, absolute) => (o.candidate = absolute(v)),
  "--third": (o, v, absolute) => (o.third = absolute(v)),
  "--scenario": (o, v) => o.scenarios.push(v),
  "--shard": (o, v) => (o.shard = parseShard(v) ?? fail(`Invalid --shard ${v}`)),
};

function fail(message: string): never {
  throw new Error(`${message}\n${USAGE}`);
}

export function parseRunOptions(args: string[], absolute: (path: string) => string): IRunOptions {
  const options: IRunOptions = {
    reference: "",
    candidate: "",
    scenarios: [],
    keep: false,
    mix: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const toggle = SWITCHES[arg];

    if (toggle) {
      options[toggle] = true;
      continue;
    }

    const set = VALUES[arg] ?? fail(`Unknown option ${arg}`);
    const value = args[++i];

    set(
      options,
      value && !value.startsWith("--") ? value : fail(`Missing value for ${arg}`),
      absolute,
    );
  }

  if (!options.reference || !options.candidate) fail("Missing --reference or --candidate");
  if (options.third && !options.mix) fail("--third needs --mix");

  return options;
}
