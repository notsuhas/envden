import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { push } from "../../sync/engine.ts";
import { syncOptions } from "../../sync/command.ts";

export const pushCommand = new Command("push")
  .option("--all", "Sync all repos")
  .option("--yes", "Confirm clean changes")
  .action(async (options) => {
    console.log(JSON.stringify(await push(createAdapters(), syncOptions(options))));
  });
