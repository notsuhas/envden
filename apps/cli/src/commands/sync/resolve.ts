import { terminalJson } from "../../output/sanitize.ts";
import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { conflictRecords } from "../../sync/local/conflicts.ts";
import { resolveConflict } from "../../sync/resolve.ts";

export const resolveCommand = new Command("resolve")
  .argument("[file]")
  .option("--list", "List unresolved conflicts")
  .option("--repo <path>", "Select a checkout")
  .addOption(new Option("--keep-mine").conflicts("takeServer"))
  .option("--take-server")
  .action(async (file, options) => {
    if (options.list) {
      console.log(terminalJson(await conflictRecords(createAdapters().home)));

      return;
    }

    console.log(
      terminalJson(
        await resolveConflict(createAdapters(), {
          ...(file ? { file } : {}),
          ...(options.repo ? { repo: options.repo } : {}),
          choice: resolutionChoice(options.keepMine, options.takeServer),
        }),
      ),
    );
  });

export function resolutionChoice(keep?: boolean, take?: boolean) {
  if (keep) return "keep-mine";

  return take ? "take-server" : "edit";
}
