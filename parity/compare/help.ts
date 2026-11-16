import { presentation } from "./presentation.ts";

export function help(text: string): string[] {
  const plain = presentation(text);
  const entries = new Set<string>();
  let commands = false;

  for (const line of plain.split("\n")) {
    const trimmed = line.trim();

    if (/^(?:commands|subcommands|available commands)\s*:/i.test(trimmed)) {
      commands = true;
      continue;
    }

    if (/^[\w ]+:$/.test(trimmed)) commands = false;

    for (const option of trimmed.matchAll(/(?:^|[\s,])(--?[\w][\w-]*)/g))
      entries.add(`option:${option[1]}`);

    if (commands && trimmed) {
      const command = /^[\w-]+/.exec(trimmed)?.[0];
      if (command) entries.add(`command:${command}`);
    }
  }

  return [...entries].sort();
}
