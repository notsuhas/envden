import { stripVTControlCharacters } from "node:util";

export function presentation(text: string): string {
  return stripVTControlCharacters(text)
    .replace(/[\u2500-\u259f\u25a0-\u25ff\u2800-\u28ff✓✔✗✘›»]/gu, " ")
    .replace(/\r\n?/g, "\n");
}

export function words(text: string): string[] {
  return (
    presentation(text)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

export function keywordPattern(text: string): RegExp {
  return new RegExp(
    words(text)
      .map((word) => RegExp.escape(word))
      .join("[^\\p{L}\\p{N}]+"),
    "iu",
  );
}
