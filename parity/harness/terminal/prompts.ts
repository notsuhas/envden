import { plainTerminal } from "./semantic.ts";

export interface IPrompt {
  question: string;
  choices: string[];
  answer: string;
  selected: string[];
}

export function promptRecord(screen: string, matched: string, answer: string): IPrompt {
  const lines = screen.split("\n");
  const needle = plainTerminal(matched.split("\n")[0] ?? matched);
  const index = lines.findLastIndex((line) => plainTerminal(line).includes(needle));
  const question = plainTerminal(lines[index] ?? matched);

  const offered = lines.slice(index + 1).flatMap((line) =>
    [...line.matchAll(/([●○◻◼▪□■◉◯])([^●○◻◼▪□■◉◯]*)/gu)].map((match) => ({
      label: plainTerminal(match[2] ?? "").replace(/\s*\/\s*$/, ""),
      selected: /[●◼■◉]/u.test(match[1] ?? ""),
    })),
  );

  return {
    question,
    choices: offered.map((choice) => choice.label),
    selected: offered.filter((choice) => choice.selected).map((choice) => choice.label),
    answer,
  };
}

export function nextPrompt(output: string, pattern: RegExp, answering: boolean) {
  const regex = new RegExp(pattern.source, pattern.flags.replaceAll("g", "") + "g");

  for (const match of output.matchAll(regex)) {
    const prefix = output.slice(0, match.index).split("\n").at(-1) ?? "";
    if (answering && /^\s*[◇✓✔]\s*$/.test(prefix)) continue;

    return match;
  }

  return null;
}
