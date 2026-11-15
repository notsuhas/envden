import { EnvdenError } from "@envden/core/errors";
import { readConfig } from "../../settings/config.ts";
import { terminalJson } from "../../output/sanitize.ts";
import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { conflictRecords } from "../../sync/local/conflicts.ts";
import { resolveConflict } from "../../sync/resolve.ts";

export const resolveCommand = new Command("resolve")
  .option("--json", "Print the result as JSON")
  .argument("[file]")
  .option("--list", "List unresolved conflicts")
  .option("--repo <path>", "Select a checkout")
  .addOption(new Option("--keep-mine").conflicts("takeServer"))
  .option("--take-server")
  .action(async (file, options) => {
    if (options.list) {
      console.log(terminalJson(await conflictRecords(createAdapters(undefined, Date.now).home)));

      return;
    }

    if (
      (options.keepMine || options.takeServer) &&
      !process.stdin.isTTY &&
      !(await readConfig(createAdapters(undefined, Date.now).home))["agent-merge"]
    )
      throw new EnvdenError(
        "INVALID_INPUT",
        "Resolution requires a terminal; use --list, or config agent-merge on before --keep-mine/--take-server",
      );

    console.log(
      terminalJson(
        await resolveConflict(createAdapters(undefined, Date.now), {
          ...(file ? { file } : {}),
          ...(options.repo ? { repo: options.repo } : {}),
          now: Date.now,
          choice: resolutionChoice(options.keepMine, options.takeServer),
        }),
      ),
    );
  });

export function resolutionChoice(keep?: boolean, take?: boolean) {
  if (keep) return "keep-mine";

  return take ? "take-server" : "edit";
}
