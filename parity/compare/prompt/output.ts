import { stripVTControlCharacters } from "node:util";
import { conversation } from "../conversation.ts";

export function withoutPromptBlocks(text: string): string {
  let inPrompt = false;
  let column = -1;

  return stripVTControlCharacters(text)
    .split("\n")
    .filter((line) => {
      const plain = line.replace(/[│┃]/g, " ");
      const title = conversation(line).length > 0;
      const selector = /^\s*>\s+\S/.test(plain);
      const continuation = column >= 0 && plain.search(/\S/) === column + 2;
      const answer = inPrompt && /^\s+\S/.test(plain);

      if (selector) column = plain.indexOf(">");
      else if (!continuation) column = -1;

      inPrompt = title || answer;

      return !(title || answer || choiceRow(plain, continuation));
    })
    .join("\n");
}

function choiceRow(line: string, continuation: boolean): boolean {
  return (
    continuation ||
    /^\s*(?:>\s+\S|(?:[●○◉◯▪□■◻◼•]|\[[ x✓•]\])\s+\S|(?:>\s*)?Yes\s*(?:[/|]\s*|\s+)No\s*$)/i.test(
      line,
    )
  );
}
