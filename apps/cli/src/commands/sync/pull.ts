import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { pull } from "../../sync/engine.ts";
import { syncOptions } from "../../sync/command.ts";

export const pullCommand = new Command("pull")
  .option("--all", "Sync all repos")
  .option("--yes", "Confirm clean changes")
  .action(async (options) => {
    console.log(JSON.stringify(await pull(createAdapters(), syncOptions(options))));
  });
