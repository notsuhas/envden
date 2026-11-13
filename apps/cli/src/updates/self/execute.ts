import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { posix } from "node:path";
import { managerEnvironment } from "./environment.ts";
import { pinnedInstall } from "./paths.ts";
import { EnvdenError } from "@envden/core/errors";
import { consent } from "../../output/questions.ts";

async function runCommand(command: string[], env = process.env) {
  const status = await Bun.spawn(command, {
    env,
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
  const pinned = pinnedInstall(command[0] ?? "", binary);

  const installer = pinned && (await installerCommand(command[0]!, pinned.manager));

  if (!pinned || !installer) {
    console.error(`envden: Cannot pin installer path. Run manually: ${command.join(" ")}`);

    return { kind: "manual" as const };
  }

  const env = managerEnvironment(pinned.manager);
  const absolute = [...installer, ...command.slice(1)];
  if (!(await confirm(absolute.join(" ")))) return { kind: "cancelled" as const };
  await run(absolute, env);
  await run([pinned.binary, "update", "--post-install"], env);

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
