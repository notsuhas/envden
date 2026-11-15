import { resolve } from "node:path";

export function executablePaths(commands: Record<string, string[]>, args: string[]): string[] {
  const paths = Object.values(commands).map((command) => command[0]!);

  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--impl") continue;
    const input = args[++i] ?? "";

    const command = input
      .slice(input.indexOf("=") + 1)
      .trim()
      .split(/\s+/)[0];

    if (command) paths.push(Bun.which(command) ?? resolve(command));
  }

  return [...new Set(paths)];
}
