import { outputObservation, type TOutputMode } from "../../compare/output.ts";
import type { Normalizer } from "../../normalize/normalizer.ts";
import type { IOutput } from "../process.ts";

export function commandNames(args: string[]): string[] {
  return [...optionName(args), ...renamedDevice(args)];
}

function optionName(args: string[]): string[] {
  const name = args[args.indexOf("--name") + 1];

  return args.includes("--name") && name ? [name] : [];
}

function renamedDevice(args: string[]): string[] {
  if (args[0] === "device" && args[1] === "rename" && args[2]) return [args[2]];

  return [];
}

export function outputMode(args: string[]): TOutputMode {
  if (args.includes("--json")) return "json";
  if (args.includes("--help")) return "help";

  return "semantic";
}

export function observeOutput(
  prefix: string,
  output: IOutput,
  mode: TOutputMode,
  normalizer: Normalizer,
  names: string[],
): Record<string, string> {
  const observations: Record<string, string> = {};

  observations[`${prefix}/stdout`] = outputObservation(
    output.stdout,
    mode,
    (text) => normalizer.text(text),
    names,
  );

  observations[`${prefix}/stderr`] = outputObservation(
    output.stderr,
    "semantic",
    (text) => normalizer.text(text),
    names,
  );

  if (output.conversation)
    observations[`${prefix}/conversation`] = normalizer.text(JSON.stringify(output.conversation));

  observations[`${prefix}/exit`] = String(output.code);

  return observations;
}
