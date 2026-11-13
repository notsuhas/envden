import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, posix } from "node:path";
import { spawnTrusted, sanitizedEnvironment, insideWorkingTree } from "@envden/core/process";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pinnedInstall } from "./paths.ts";
import { EnvdenError } from "@envden/core/errors";
import { consent } from "../../output/questions.ts";

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

export async function postInstall(binary: string, run = runCommand) {
  await run([binary, "update", "--post-install"]);
}

export async function managerUpdate(
  command: string[],
  binary: string,
  confirm = (line: string) => consent(`Run ${line}?`),
  run = runCommand,
) {
  const home = process.env.HOME ?? process.env.USERPROFILE;
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

  const installer = pinned && (await installerCommand(command[0]!, pinned.manager));

  if (!pinned || !installer) {
    console.error(`envden: Cannot pin installer path. Run manually: ${command.join(" ")}`);

    return { kind: "manual" as const };
  }

  const managerBin = dirname(pinned.manager);
  const env = sanitizedEnvironment({}, process.env, managerBin);
  const absolute = [...installer, ...command.slice(1)];
  if (!(await confirm(absolute.join(" ")))) return { kind: "cancelled" as const };
  const config = await mkdtemp(join(temp, "envden-manager-"));

  try {
    if (command[0] === "npm") {
      const userconfig = join(config, "npmrc");
      await writeFile(userconfig, "", { mode: 0o600 });
      absolute.push("--userconfig", userconfig);
    }

    // Homebrew reads system and prefix brew.env files even with an isolated user config.
    if (command[0] === "brew") env.HOMEBREW_XDG_CONFIG_HOME = config;
    await run(absolute, env, managerBin);
    await run([pinned.binary, "update", "--post-install"], sanitizedEnvironment());
  } finally {
    await rm(config, { recursive: true, force: true });
  }

  return { kind: "updated" as const };
}

async function installerCommand(manager: string, path: string) {
  if (manager !== "npm") return [path];
  const directory = posix.dirname(path);
  const windows = /^[A-Za-z]:/.test(path);
  const node = `${directory}/${windows ? "node.exe" : "node"}`;

  const cli = windows
    ? `${directory}/node_modules/npm/bin/npm-cli.js`
    : `${directory}/../lib/node_modules/npm/bin/npm-cli.js`;

  try {
    await access(node, constants.X_OK);
    await access(cli, constants.R_OK);

    return [node, posix.normalize(cli)];
  } catch {
    return undefined;
  }
}
