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

  return found.sort((a, b) => a.start - b.start).map((item) => item.key);
}

export function conversationTurn(text: string, answer: string) {
  return { prompts: conversation(text), choices: choices(text), answer };
}

export function choices(text: string): string[] {
  const lines = text.split("\n");

  const offered = lines.filter((line) =>
    /[●○◉◯▪□■]|\[[ x✓]\]|^\s*>\s|\bYes\s*[/|]\s*No\b/i.test(line),
  );

  const labels = offered
    .flatMap((line) => line.split(/[●○◉◯▪□■]|\[[ x✓]\]|^\s*>\s|\s+[|/]\s+/))
    .map((line) => presentation(line).replace(/^[\s/|]+|[\s/|]+$/g, ""))
    .filter(Boolean);

  return [
    ...labels.map((line) => words(line).join(" ")).filter(Boolean),
    ...facts(labels.join("\n")),
  ].sort();
}
