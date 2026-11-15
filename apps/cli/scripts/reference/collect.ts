import type { Argument, CommandUnknownOpts, Option } from "@commander-js/extra-typings";

export interface IReferenceRow {
  term: string;
  description: string;
  default?: string;
}

export interface ICommandReference {
  path: string;
  usage: string;
  description: string;
  subcommands: string[];
  arguments: IReferenceRow[];
  options: IReferenceRow[];
}

export function collectCommands(program: CommandUnknownOpts): ICommandReference[] {
  return visibleSubcommands(program).flatMap((command) => collect(command, [program.name()]));
}

function collect(command: CommandUnknownOpts, parents: string[]): ICommandReference[] {
  const path = [...parents, command.name()].join(" ");
  const children = visibleSubcommands(command);

  const reference = {
    path,
    usage: `${path} ${command.usage()}`,
    description: command.description(),
    subcommands: children.map((child) => child.name()),
    arguments: command.registeredArguments.map(argumentRow),
    options: command.options.filter((option) => !option.hidden).map(optionRow),
  };

  return [reference, ...children.flatMap((child) => collect(child, path.split(" ")))];
}

// Help adds an implicit help command, so keep only registered ones.
function visibleSubcommands(command: CommandUnknownOpts) {
  return command
    .createHelp()
    .visibleCommands(command)
    .filter((child) => command.commands.includes(child))
    .toSorted((a, b) => (a.name() < b.name() ? -1 : 1));
}

function argumentRow(argument: Argument): IReferenceRow {
  const name = `${argument.name()}${argument.variadic ? "..." : ""}`;

  return row(
    argument.required ? `<${name}>` : `[${name}]`,
    argument.description,
    argument.argChoices,
    argument.defaultValueDescription,
    argument.defaultValue,
  );
}

function optionRow(option: Option): IReferenceRow {
  return row(
    option.flags,
    option.description,
    option.argChoices,
    option.defaultValueDescription,
    option.defaultValue,
  );
}

function row(
  term: string,
  description: string,
  choices: string[] | undefined,
  defaultDescription: string | undefined,
  defaultValue: unknown,
): IReferenceRow {
  const shown =
    defaultDescription ?? (defaultValue === undefined ? undefined : JSON.stringify(defaultValue));

  return {
    term,
    description: choices ? `${description} (${choices.join(", ")})` : description,
    ...(shown === undefined ? {} : { default: shown }),
  };
}
