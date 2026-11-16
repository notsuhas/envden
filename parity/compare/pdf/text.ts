import type { IPdfToken } from "../pdf-strings.ts";

export function shownText(tokens: IPdfToken[]): string[] {
  const result: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind !== "word") continue;
    const text = textOperand(tokens, i);
    if (text !== undefined) result.push(text);
  }

  return result;
}

function textOperand(tokens: IPdfToken[], i: number): string | undefined {
  if (tokens[i]!.value === "Tj" && tokens[i - 1]?.kind === "string") return tokens[i - 1]!.value;

  if (tokens[i]!.value === "TJ" && tokens[i - 1]?.value === "]") return arrayText(tokens, i);

  return undefined;
}

function arrayText(tokens: IPdfToken[], i: number): string {
  let start = i - 2;
  while (start >= 0 && tokens[start]?.value !== "[") start--;

  return tokens
    .slice(start + 1, i - 1)
    .filter((part) => part.kind === "string")
    .map((part) => part.value)
    .join("");
}
