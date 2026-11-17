import { outputObservation, type TOutputMode } from "../../compare/output.ts";
import type { Normalizer } from "../../normalize/normalizer.ts";
import { conversationTurn } from "../../compare/conversation.ts";
import type { IOutput, ITurn } from "../process/types.ts";

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

// Prompt keys are taken from normalized screens so temporary paths never reach them.
function turns(conversation: ITurn[], normalizer: Normalizer) {
  let previous: string | undefined;

  return conversation.map(({ screen, answer }) => {
    const turn = conversationTurn(normalizer.text(screen), answer, previous);

    previous = turn.prompts.at(-1);

    return turn;
  });
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
  const recorded = output.conversation ? turns(output.conversation, normalizer) : undefined;

  observations[`${prefix}/stdout`] = outputObservation(
    output.stdout,
    mode,
    (text) => normalizer.text(text),
    names,
    recorded?.flatMap((turn) => turn.prompts),
  );

  observations[`${prefix}/stderr`] = outputObservation(
    output.stderr,
    "semantic",
    (text) => normalizer.text(text),
    names,
  );

  if (recorded) observations[`${prefix}/conversation`] = normalizer.text(JSON.stringify(recorded));

  observations[`${prefix}/exit`] = String(output.code);

  return observations;
}
