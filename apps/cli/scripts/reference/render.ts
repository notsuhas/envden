import type { ICommandReference, IReferenceRow } from "./collect.ts";

const HEADER = `---
title: CLI reference
description: Every envden command with its arguments and options.
---

This page is generated from the CLI's own help text; run \`bun run docs:cli\` in the repository to regenerate it. Every command also accepts \`-h, --help\`.
`;

export function renderReference(commands: ICommandReference[]): string {
  return [HEADER, ...commands.map(renderCommand)].join("\n");
}

function renderCommand(command: ICommandReference): string {
  const blocks = [`## ${command.path}`];

  if (command.description) blocks.push(sentence(escapeText(command.description)));
  blocks.push(["```sh", command.usage, "```"].join("\n"));

  if (command.subcommands.length)
    blocks.push(
      `Subcommands: ${command.subcommands.map((name) => `[\`${name}\`](#${anchor(`${command.path} ${name}`)})`).join(", ")}.`,
    );

  if (command.arguments.length) blocks.push(table("Argument", command.arguments));
  if (command.options.length) blocks.push(table("Option", command.options));

  return blocks.map((block) => `${block}\n`).join("\n");
}

// Columns are padded to equal width, matching the formatter's table layout.
function table(label: string, rows: IReferenceRow[]): string {
  const withDefault = rows.some((row) => row.default !== undefined);

  const cells = [
    [label, "Description", ...(withDefault ? ["Default"] : [])],
    ...rows.map((row) => [
      `\`${row.term}\``,
      escapeCell(row.description),
      ...(withDefault ? [row.default === undefined ? "" : escapeCell(row.default)] : []),
    ]),
  ];

  const widths = cells[0]!.map((_, column) =>
    Math.max(3, ...cells.map((line) => line[column]!.length)),
  );

  const line = (values: string[]) =>
    `| ${values.map((value, column) => value.padEnd(widths[column]!)).join(" | ")} |`;

  return [
    line(cells[0]!),
    line(widths.map((width) => "-".repeat(width))),
    ...cells.slice(1).map(line),
  ].join("\n");
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function escapeText(text: string): string {
  return text.replaceAll(/[\\<>{}]/g, (character) => `\\${character}`);
}

function escapeCell(text: string): string {
  return escapeText(text).replaceAll("|", "\\|");
}

function anchor(heading: string): string {
  return heading
    .toLowerCase()
    .replaceAll(/[^a-z0-9 -]/g, "")
    .replaceAll(" ", "-");
}
