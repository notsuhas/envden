import { facts } from "./facts.ts";
import { help } from "./help.ts";
import { conversation } from "./conversation.ts";
import { withoutPromptBlocks } from "./prompt/output.ts";

export type TOutputMode = "semantic" | "json" | "help" | "pty";

export function outputObservation(
  text: string,
  mode: TOutputMode,
  normalize: (text: string) => string,
  names: string[] = [],
): string {
  if (mode === "json" && text.trim()) {
    const value: unknown = JSON.parse(text);

    return normalize(JSON.stringify(value));
  }

  const normalized = normalize(text);
  if (mode === "help") return JSON.stringify(help(normalized));

  return JSON.stringify({
    facts: facts(
      mode === "pty" ? withoutPromptBlocks(normalized) : normalized,
      names.map(normalize),
    ),
    ...(mode === "pty" ? { prompts: conversation(normalized) } : {}),
  });
}
