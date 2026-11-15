import { EnvdenError } from "@envden/core/errors";
import { terminalJson } from "../../output/sanitize.ts";
import { syncText } from "../../output/render/sync.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { pull } from "../../sync/engine.ts";
import { syncOptions } from "../../sync/command.ts";

export const pullCommand = new Command("pull")
  .description("Fetch and merge changes from your other devices")
  .option("--json", "Print the result as JSON")
  .option("--all", "Sync all repos")
  .option("--yes", "Confirm clean changes")
  .action(async (options) => {
    const result = await pull(createAdapters(undefined, Date.now), syncOptions(options, Date.now));

    console.log(options.json ? terminalJson(result) : syncText("pull", result));

    if (result.conflicts)
      throw new EnvdenError("CONFLICT", "Run envden resolve --list to see the conflicts");
  });
