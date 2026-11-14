import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { consent } from "../../output/questions.ts";
import { terminalJson, sanitizeTerminal } from "../../output/sanitize.ts";
import { removeFile } from "../../sync/remove.ts";

export const rmCommand = new Command("rm")
  .argument("<path>")
  .description("Remove an env file everywhere on the next push")
  .option("--yes", "Confirm deletion, including local edits and conflicts")
  .option("--json", "Print the result as JSON")
  .action(async (path, options) => {
    const result = await removeFile(createAdapters(), path, {
      yes: !!options.yes,
      interactive: !!process.stdin.isTTY,
      confirm: consent,
      now: Date.now,
    });

    if (options.json) console.log(terminalJson(result));
    else {
      for (const saved of result.preserved) console.log(sanitizeTerminal(`Saved backup: ${saved}`));
      console.log("Removed locally; run envden push to delete everywhere");
    }
  });
