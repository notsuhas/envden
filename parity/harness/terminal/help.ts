import { stripVTControlCharacters } from "node:util";

const builtins = new Set(["help", "-h", "--help", "-V", "--version"]);

function rowNames(line: string): string[] {
  const option = /^[ \t]+(-\S.*?)(?:[ \t]{2,}\S|$)/.exec(line)?.[1];
  if (option) return option.match(/(?<=^|[ ,|])--?[a-z][\w-]*/gi) ?? [];

  const declaration = /^[ \t]+(\S.*?)(?:[ \t]{2,}|\t)\S/.exec(line)?.[1];
  if (!declaration) return [];

  const command = /^([a-z][\w-]*)(?:[ \t]+(?:\[[^\]]+\]|<[^>]+>))*$/i.exec(declaration)?.[1];

  return command ? [command] : [];
}

export function helpNames(text: string): string[] {
  const names = new Set<string>();
  let argumentsSection = false;

  for (const line of stripVTControlCharacters(text).split("\n")) {
    if (/^\S.*:\s*$/.test(line)) argumentsSection = /^Arguments:/i.test(line);
    if (argumentsSection) continue;

    for (const name of rowNames(line)) names.add(name);
  }

  return [...names].filter((name) => !builtins.has(name)).sort();
}
