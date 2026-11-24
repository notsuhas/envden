import { lstat } from "node:fs/promises";
import { release } from "node:os";
import { join, sep } from "node:path";
import { serviceFile } from "../agent/service/location.ts";
import { installMethod } from "../updates/install.ts";
import { VERSION } from "../version.ts";
import { maskArguments } from "./content/arguments.ts";
import { describeFailure } from "./content/failure.ts";

const LOG_BYTES = 64 * 1024;

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

async function logTail(path: string): Promise<string | undefined> {
  const stat = await lstat(path).catch(() => undefined);
  if (!stat?.isFile()) return undefined;

  // Bun returns nothing for a negative slice longer than the file.
  return Bun.file(path)
    .slice(Math.max(0, stat.size - LOG_BYTES))
    .text();
}

async function installLabel(home: string): Promise<string> {
  return installMethod(home).then(
    (method) => (method.kind === "script" ? "script" : method.command[0]!),
    () => "unknown",
  );
}

async function relevantFiles(home: string, userHome: string) {
  const paths = [
    join(home, "server.log"),
    `${join(home, "state")}${sep}`,
    join(home, "config.json"),
    serviceFile(process.platform, userHome),
  ].filter((path) => path !== undefined);

  return Promise.all(paths.map(async (path) => ({ path, exists: await exists(path) })));
}

export async function reportFacts(
  home: string,
  userHome: string,
  error: unknown,
  argv: readonly string[],
) {
  return {
    version: VERSION,
    os: `${process.platform} ${release()}`,
    arch: process.arch,
    install: await installLabel(home),
    args: maskArguments(argv),
    failure: describeFailure(error),
    serverLog: await logTail(join(home, "server.log")),
    files: await relevantFiles(home, userHome),
    userHome,
  };
}
