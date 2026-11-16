import { stripVTControlCharacters } from "node:util";
import { conversation } from "../conversation.ts";

// Prompt blocks are compared as conversation turns. A line naming a prompt is its title only when it asks a question or choices or one answer follow it.
export function withoutPromptBlocks(text: string): string {
  const lines = stripVTControlCharacters(text).split("\n");
  const plain = lines.map((line) => line.replace(/[│┃]/g, " "));
  const dropped = choiceRows(plain);

  for (let i = 0; i < lines.length; i++) {
    if (dropped.has(i) || conversation(lines[i]!).length === 0) continue;

    const next = plain.findIndex((line, n) => n > i && line.trim() !== "");
    const answer = next >= 0 && !dropped.has(next) && /^\s+\S/.test(plain[next]!);

    if (answer) dropped.add(i).add(next);
    else if ((next >= 0 && dropped.has(next)) || /\?\s*$/.test(plain[i]!)) dropped.add(i);
  }

  return lines.filter((_, i) => !dropped.has(i)).join("\n");
}

function choiceRows(plain: string[]): Set<number> {
  const rows = new Set<number>();
  let column = -1;

  plain.forEach((line, i) => {
    const selector = /^\s*>\s+\S/.test(line);
    const continuation = column >= 0 && line.search(/\S/) === column + 2;

    if (selector) column = line.indexOf(">");
    else if (!continuation) column = -1;

    if (continuation || choiceRow(line)) rows.add(i);
  });

  return rows;
}

function choiceRow(line: string): boolean {
  return /^\s*(?:>\s+\S|(?:[●○◉◯▪□■◻◼•]|\[[ x✓•]\])\s+\S|(?:>\s*)?Yes\s*(?:[/|]\s*|\s+)No\s*$)/i.test(
    line,
  );
}
