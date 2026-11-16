import { breakTextIntoLines } from "pdf-lib";

// pdf-lib breaks only at spaces, so a longer word is split between characters to stay in the margins.
export function wrapText(text: string, width: number, measure: (part: string) => number) {
  return breakTextIntoLines(text, [" "], width, measure).flatMap((line) => {
    const trimmed = line.trim();

    return measure(trimmed) <= width ? [trimmed] : splitWord(trimmed, width, measure);
  });
}

function splitWord(word: string, width: number, measure: (part: string) => number) {
  const lines: string[] = [];
  let line = "";

  for (const character of word) {
    if (line && measure(line + character) > width) {
      lines.push(line);
      line = "";
    }

    line += character;
  }

  return [...lines, line];
}
