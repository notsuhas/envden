import { EnvdenError } from "@envden/core/errors";
import { terminalJson } from "../../output/sanitize.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { push } from "../../sync/engine.ts";
import { syncOptions } from "../../sync/command.ts";

export const pushCommand = new Command("push")
  .option("--json", "Print the result as JSON")
  .option("--all", "Sync all repos")
  .option("--yes", "Confirm clean changes")
  .action(async (options) => {
    const result = await push(createAdapters(), syncOptions(options));
    console.log(terminalJson(result));

    if (result.conflicts || result.kind === "conflict")
      throw new EnvdenError("CONFLICT", "Sync has unresolved conflicts; run envden resolve --list");
  });
