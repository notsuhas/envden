import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IStep } from "../types.ts";

export function cli(device: string, args: string[], code = 0): IStep {
  return {
    name: `${device}: ${args.join(" ")}`,
    run: async (c) => {
      await c.cli(device, args, code);
    },
  };
}

export function edit(device: string, contents: string, file = ".env"): IStep {
  return {
    name: `${device}: edit ${file}`,
    run: async (c) => {
      c.normalizer.literal(contents);
      await writeFile(join(c.get(device).checkout, file), contents);
    },
  };
}

export const reports = [
  cli("a", ["status"]),
  cli("a", ["status", "--json"]),
  cli("a", ["diff"]),
  cli("a", ["diff", "--json"]),
  cli("a", ["history", ".env"]),
  cli("a", ["history", ".env", "--json"]),
  cli("a", ["doctor", "--json"]),
];
