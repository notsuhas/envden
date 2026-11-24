import { dirname } from "node:path";
import { spawnTrusted, sanitizedEnvironment, insideWorkingTree } from "@envden/core/process";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pinnedInstall } from "./paths.ts";
import { EnvdenError } from "@envden/core/errors";
import { consent } from "../../output/prompts/questions.ts";

async function runCommand(
  command: string[],
  env: Record<string, string> = {},
  managerBin?: string,
) {
  const status = await spawnTrusted(command[0]!, command.slice(1), {
    env,
    ...(managerBin ? { managerBin } : {}),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).exited;

  if (status !== 0) throw new EnvdenError("INVALID_INPUT", "Update command failed");
}

export async function postInstall(binary: string, run = runCommand, managerBin?: string) {
  await run([binary, "update", "--post-install"], postInstallEnvironment(managerBin), managerBin);
}

export async function managerUpdate(
  command: string[],
  binary: string,
  confirm = (line: string) => consent(`Run ${line}?`),
  run = runCommand,
) {
  const home = process.env.HOME;
  const temp = await realpath(tmpdir());

  if (
    (home && insideWorkingTree(await realpath(home).catch(() => home))) ||
    insideWorkingTree(temp)
  ) {
    console.error(
      `envden: HOME or temp directory is inside a checkout. Run manually: ${command.join(" ")}`,
    );

    return { kind: "manual" as const };
  }

  const pinned = pinnedInstall(command[0] ?? "", binary);

  if (!pinned) {
    console.error(`envden: Cannot pin installer path. Run manually: ${command.join(" ")}`);

    return { kind: "manual" as const };
  }

  const managerBin = dirname(pinned.manager);
  const env = sanitizedEnvironment({}, process.env, managerBin);
  const absolute = [pinned.manager, ...command.slice(1)];
  if (!(await confirm(absolute.join(" ")))) return { kind: "cancelled" as const };

  await run(absolute, env, managerBin);
  await postInstall(pinned.binary, run, managerBin);

  return { kind: "updated" as const };
}

function postInstallEnvironment(managerBin?: string) {
  const extra: Record<string, string> = {};

  for (const key of ["ENVDEN_HOME", "ENVDEN_NO_UPDATE_CHECK", "ENVDEN_TELEMETRY", "DO_NOT_TRACK"]) {
    const value = process.env[key];
    if (value !== undefined) extra[key] = value;
  }

  return sanitizedEnvironment(extra, process.env, managerBin);
}
