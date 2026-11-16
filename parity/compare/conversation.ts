import { stripVTControlCharacters } from "node:util";
import { presentation, words } from "./presentation.ts";
import { facts } from "./facts.ts";

const prompts = [
  "confirm master password",
  "old master password",
  "wrong master password try again",
  "master password",
  "recovery secret key",
  "host server machine",
  "server address",
  "server setup token",
  "anonymous telemetry",
  "check updates daily",
  "install shell notice",
  "install agent skill",
  "sync env files checkouts",
  "let envden manage",
  "pairing code",
  "remove device",
  "add device",
];

const filler = new Set(
  "the on this for these to do you want would like please a an can may it".split(" "),
);

export function conversation(text: string): string[] {
  const plain = presentation(text).toLowerCase();
  const tokens = [...plain.matchAll(/[\p{L}\p{N}]+/gu)].filter((token) => !filler.has(token[0]));
  const found: { start: number; end: number; key: string }[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const key = prompts.find((prompt) =>
      prompt.split(" ").every((word, n) => tokens[i + n]?.[0] === word),
    );

    if (!key) continue;
    const last = tokens[i + key.split(" ").length - 1]!;
    found.push({ start: tokens[i]!.index, end: last.index + last[0].length, key });
    i += key.split(" ").length - 1;
  }

  let offset = 0;

  for (const line of plain.split("\n")) {
    if (
      line.includes("?") &&
      !found.some((item) => item.start < offset + line.length && item.end > offset)
    )
      found.push({ start: offset, end: offset + line.length, key: words(line).join(" ") });

    offset += line.length + 1;
  }

  return found
    .sort((a, b) => a.start - b.start)
    .map((item) => item.key)
    .filter((key, index, keys) => key !== keys[index - 1]);
}

export function conversationTurn(text: string, answer: string, previousPrompt?: string) {
  const prompts = conversation(text);
  if (prompts.length > 1 && prompts[0] === previousPrompt) prompts.shift();

  return { prompts, choices: choices(text), answer };
}

export function choices(text: string): string[] {
  const lines = stripVTControlCharacters(text).replace(/[│┃]/g, " ").split("\n");
  const labels: string[] = [];
  const marker = /[●○◉◯▪□■◻◼•✓]|\[[ x✓•]\]/;
  const selector = lines.find((line) => /^\s*>\s+\S/.test(line));
  const column = selector?.indexOf(">") ?? -1;

  for (const line of lines) {
    const plain = presentation(line).trim();

    // key hints (navigate, select, confirm) are presentation, not offered choices
    if (/↑|↓|\bto navigate\b|\benter\b.*\bconfirm\b|\bspace\b.*\bselect\b/i.test(plain)) continue;

    if (/^(?:>\s*)?Yes\s*(?:[/|]\s*|\s+)No$/i.test(plain)) {
      labels.push("Yes", "No");
      continue;
    }

    if (marker.test(line)) {
      labels.push(...line.split(/[●○◉◯▪□■◻◼•✓]|\[[ x✓•]\]/));
      continue;
    }

    if (/^\s*>\s+/.test(line)) labels.push(line.replace(/^\s*>\s+/, ""));
    else if (column >= 0 && line.search(/\S/) === column + 2) labels.push(line.trim());
  }

  const offered = [
    ...new Set(
      labels.map((line) => presentation(line).replace(/^[\s/|>]+|[\s/|]+$/g, "")).filter(Boolean),
    ),
  ];

  return [
    ...offered.map((line) => words(line).join(" ")).filter(Boolean),
    ...facts(offered.join("\n")),
  ].sort();
}

export function withoutChoiceRows(text: string): string {
  let column = -1;

  return stripVTControlCharacters(text)
    .split("\n")
    .map((line) => line.replace(/(?:[●○◉◯]\s*)?Yes\s*[/|]\s*(?:[●○◉◯]\s*)?No\s*$/i, ""))
    .filter((line) => {
      const plain = line.replace(/[│┃]/g, " ");
      const selector = /^\s*>\s+\S/.test(plain);
      const continuation = column >= 0 && plain.search(/\S/) === column + 2;

      if (selector) column = plain.indexOf(">");
      else if (!continuation) column = -1;

      return !(
        selector ||
        continuation ||
        /^\s*(?:[●○◉◯▪□■◻◼•✓]|\[[ x✓•]\])\s+\S/.test(plain) ||
        /^\s*(?:>\s*)?Yes\s*(?:[/|]\s*|\s+)No\s*$/i.test(plain)
      );
    })
    .join("\n");
}
