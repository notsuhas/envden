import type { IResult } from "../types.ts";
import { plainTerminal } from "./semantic.ts";

export function separateNotices(results: IResult[]) {
  const notices: Record<string, string[]> = {};

  const steps = results.map((step) => {
    const role = step.label.split(" ")[0]!;

    const clean = (output: string) =>
      output
        .split("\n")
        .filter((line) => {
          const match = /^envden: (.+) joined with the recovery kit$/.exec(plainTerminal(line));
          if (!match) return true;
          (notices[role] ??= []).push(match[1]!);

          return false;
        })
        .join("\n");

    return { ...step, stdout: clean(step.stdout), stderr: clean(step.stderr) };
  });

  return { steps, notices };
}
