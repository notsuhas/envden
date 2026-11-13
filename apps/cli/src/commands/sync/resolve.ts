import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { resolveConflict } from "../../sync/resolve.ts";

export const resolveCommand = new Command("resolve")
  .argument("[file]")
  .addOption(new Option("--keep-mine").conflicts("takeServer"))
  .option("--take-server")
  .action(async (file, options) => {
    console.log(
      JSON.stringify(
        await resolveConflict(createAdapters(), {
          ...(file ? { file } : {}),
          choice: options.keepMine ? "keep-mine" : options.takeServer ? "take-server" : "edit",
        }),
      ),
    );
  });
