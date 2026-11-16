import { presentation } from "./presentation.ts";

const HEADING = /^[\w][\w ]*:\s*$/;
const SKIPPED = /^(?:usage|arguments|examples|description)\s*:/i;
const OPTIONS = /^(?:options|(?:global |local |inherited )?flags)\s*:/i;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function signatures(lines: string[]): string[] {
  const rows = lines.filter((line) => /^\s+\S/.test(line));
  const indent = Math.min(...rows.map(indentOf));

  return rows
    .filter((line) => indentOf(line) === indent)
    .map((line) => line.trim().split(/\s{2,}/)[0]!);
}

function optionEntries(signature: string): string[] {
  if (!signature.startsWith("-")) return [];

  return [...signature.matchAll(/(?:^|[\s,])(--?[\w][\w-]*)/g)].map(
    (match) => `option:${match[1]}`,
  );
}

function commandEntries(signature: string): string[] {
  const command = /^[\w-]+/.exec(signature)?.[0];

  return command ? [`command:${command}`] : [];
}

function sectionEntries(section: string): string[] {
  const [heading = "", ...lines] = section.split("\n");
  if (!HEADING.test(heading) || SKIPPED.test(heading)) return [];

  const entries = OPTIONS.test(heading) ? optionEntries : commandEntries;

  return signatures(lines).flatMap(entries);
}

export function help(text: string): string[] {
  const sections = presentation(text).split(/^(?=[\w][\w ]*:\s*$)/m);

  return [...new Set(sections.flatMap(sectionEntries))].sort();
}
