import { pinnedInstall } from "./paths.ts";
import { EnvdenError } from "@envden/core/errors";
import { consent } from "../../output/questions.ts";

async function runCommand(command: string[]) {
  const status = await Bun.spawn(command, {
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

  if (!pinned) {
    console.error(`envden: Cannot pin installer path. Run manually: ${command.join(" ")}`);

    return { kind: "manual" as const };
  }

  const absolute = [pinned.manager, ...command.slice(1)];
  if (!(await confirm(absolute.join(" ")))) return { kind: "cancelled" as const };
  await run(absolute);
  await postInstall(pinned.binary, run);

  return { kind: "updated" as const };
}
