import { presentation } from "./presentation.ts";

const HEADING = /^[\w][\w ]*:\s*$/;
const SKIPPED = /^(?:usage|arguments|examples|description)\s*:/i;
const OPTIONS = /^(?:options|(?:global |local |inherited )?flags)\s*:/i;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function signatures(lines: string[], options: boolean): string[] {
  if (options) return lines.map((line) => line.trim()).filter((line) => line.startsWith("-"));

  const rows = lines.filter((line) => /^\s+\S/.test(line));
  const indent = Math.min(...rows.map(indentOf));

  return rows
    .filter((line) => indentOf(line) === indent)
    .map((line) => line.trim().split(/\s{2,}/)[0]!);
}

// the flags lead the row; the first word that isn't a flag starts the value name or description
function optionEntries(row: string): string[] {
  const flags: string[] = [];

  for (const token of row.split(/[\s,]+/)) {
    if (!/^--?[\w][\w-]*$/.test(token)) break;
    flags.push(`option:${token}`);
  }

  return flags;
}

function commandEntries(signature: string): string[] {
  const command = /^[\w-]+/.exec(signature)?.[0];

  return command ? [`command:${command}`] : [];
}

function sectionEntries(section: string): string[] {
  const [heading = "", ...lines] = section.split("\n");
  if (!HEADING.test(heading) || SKIPPED.test(heading)) return [];

  const options = OPTIONS.test(heading);

  return signatures(lines, options).flatMap(options ? optionEntries : commandEntries);
}

export function help(text: string): string[] {
  const sections = presentation(text).split(/^(?=[\w][\w ]*:\s*$)/m);

  return [...new Set(sections.flatMap(sectionEntries))].sort();
}
