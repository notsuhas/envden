import { EnvdenError } from "@envden/core/errors";
import { terminalJson } from "../../output/sanitize.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { pull } from "../../sync/engine.ts";
import { syncOptions } from "../../sync/command.ts";

export const pullCommand = new Command("pull")
  .option("--all", "Sync all repos")
  .option("--yes", "Confirm clean changes")
  .action(async (options) => {
    const result = await pull(createAdapters(), syncOptions(options));
    console.log(terminalJson(result));

    if (result.conflicts)
      throw new EnvdenError("CONFLICT", "Sync has unresolved conflicts; run envden resolve --list");
  });
