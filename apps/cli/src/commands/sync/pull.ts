import { EnvdenError } from "@envden/core/errors";
import { terminalJson } from "../../output/sanitize.ts";
import { syncText } from "../../output/render/sync/sync.ts";
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

    if (options.json) console.log(terminalJson(result));
    else if (!result.conflicts) console.log(syncText("pull", result));

    // the conflict lines above already name each file; this summary sets exit code 3
    if (result.conflicts) throw new EnvdenError("CONFLICT", syncText("pull", result));
  });
