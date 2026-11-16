import { conversation, promptKeys } from "../conversation.ts";

// A repeated prompt is ready only once it shows again after its answered redraw.
export function matchesPrompt(text: string, expected: string, previous?: string): boolean {
  const keys = promptKeys(text);
  const current = keys.at(-1);
  const target = conversation(expected).at(-1);

  if (!target || current !== target) return false;

  return current !== previous || keys.filter((key) => key === target).length > 1;
}
