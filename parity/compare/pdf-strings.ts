import { literalString, hexString } from "./pdf/literals.ts";

export interface IPdfToken {
  kind: "string" | "word";
  value: string;
}

export function pdfTokens(text: string): IPdfToken[] {
  const tokens: IPdfToken[] = [];

  for (let i = 0; i < text.length;) {
    const c = text[i]!;

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === "%") {
      i = text.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }

    const parsed = readToken(text, i);
    tokens.push(parsed.token);
    i = parsed.end;
  }

  return tokens;
}

function readToken(text: string, start: number): { token: IPdfToken; end: number } {
  if (text[start] === "(") {
    const { value, end } = literalString(text, start);

    return { token: { kind: "string", value }, end };
  }

  if (text[start] === "<" && text[start + 1] !== "<") {
    const { value, end } = hexString(text, start);

    return { token: { kind: "string", value }, end };
  }

  const word = /^(?:<<|>>|\[|\]|\/[^\s<>()[\]{}%/]+|[^\s<>()[\]{}%/]+)/.exec(
    text.slice(start),
  )?.[0];

  if (!word) throw new Error("Unsupported PDF token");

  return { token: { kind: "word", value: word }, end: start + word.length };
}
