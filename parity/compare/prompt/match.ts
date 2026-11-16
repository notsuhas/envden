import { conversation } from "../conversation.ts";

export function matchesPrompt(text: string, expected: string, previous?: string): boolean {
  const current = conversation(text).at(-1);
  const target = conversation(expected).at(-1);

  return Boolean(target && current === target && current !== previous);
}
