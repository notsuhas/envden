import { EnvdenError } from "../errors/index.ts";
import { sanitizedEnvironment } from "./environment.ts";
import { resolveTrustedExecutable } from "./trust.ts";

type TOptions = {
  env?: Record<string, string | undefined>;
  cwd?: string;
  timeout?: number;
  managerBin?: string;
  stdin?: "inherit" | "ignore" | Blob;
  stdout?: "inherit" | "ignore" | "pipe";
  stderr?: "inherit" | "ignore" | "pipe";
};

export function spawnTrusted(
  command: string[],
  options?: TOptions,
): Bun.Subprocess<"ignore", "pipe", "pipe">;

export function spawnTrusted(
  name: string,
  args: string[],
  options: TOptions & { sync: true },
): Bun.SyncSubprocess;

export function spawnTrusted(
  name: string,
  args: string[],
  options?: TOptions,
): Bun.Subprocess<"ignore", "pipe", "pipe">;

export function spawnTrusted(
  nameOrCommand: string | string[],
  argsOrOptions: string[] | TOptions = [],
  options: TOptions & { sync?: boolean } = {},
) {
  const name = typeof nameOrCommand === "string" ? nameOrCommand : nameOrCommand[0]!;

  const args = Array.isArray(nameOrCommand)
    ? nameOrCommand.slice(1)
    : Array.isArray(argsOrOptions)
      ? argsOrOptions
      : [];

  const settings = Array.isArray(argsOrOptions) ? options : argsOrOptions;
  const command = [resolveTrustedExecutable(name), ...args];
  const env = sanitizedEnvironment(settings.env, process.env, settings.managerBin);

  if ("sync" in settings && settings.sync)
    return Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe", ...settings, env });

  return Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe", ...settings, env });
}

export async function execTrusted(name: string, args: string[], options: TOptions = {}) {
  const child = spawnTrusted(name, args, options);

  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  const status = await child.exited;

  if (status !== 0)
    throw new EnvdenError("INVALID_INPUT", "Subprocess failed", { cause: { exitCode: status } });

  return { stdout, stderr };
}

export function execTrustedSync(
  name: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {},
) {
  const result = spawnTrusted(name, args, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    timeout: options.timeout ?? 5000,
    sync: true,
  });

  if (result.exitCode !== 0) throw new EnvdenError("INVALID_INPUT", "Subprocess failed");

  return result.stdout?.toString() ?? "";
}
