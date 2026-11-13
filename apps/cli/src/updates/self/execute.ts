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
  resolveBinary = (previous: string) => Bun.which("envden") ?? previous,
) {
  if (!(await confirm(command.join(" ")))) return { kind: "cancelled" as const };
  await run(command);
  await postInstall(resolveBinary(binary), run);

  return { kind: "updated" as const };
}
