import { EnvdenError } from "@envden/core/errors";
import { terminalJson } from "../../output/sanitize.ts";
import { syncText } from "../../output/render/sync/sync.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { push } from "../../sync/engine.ts";
import { syncOptions } from "../../sync/command.ts";

export const pushCommand = new Command("push")
  .description("Send your changes to the server")
  .option("--json", "Print the result as JSON")
  .option("--all", "Sync all repos")
  .option("--yes", "Confirm clean changes")
  .action(async (options) => {
    const result = await push(createAdapters(undefined, Date.now), syncOptions(options, Date.now));

    const conflicted = result.conflicts || result.kind === "conflict";

    if (options.json) console.log(terminalJson(result));
    else if (!conflicted) console.log(syncText("push", result));

    // the conflict lines above already name each file; this summary sets exit code 3
    if (conflicted) throw new EnvdenError("CONFLICT", syncText("push", result));
  });
