import { terminalJson } from "../../output/sanitize.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { diff } from "../../sync/diff.ts";
import { syncOptions } from "../../sync/command.ts";

export const diffCommand = new Command("diff")
  .description("Show changed key names without values")
  .option("--all", "Include all repos")
  .action(async (options) => {
    console.log(
      terminalJson(await diff(createAdapters(undefined, Date.now), syncOptions(options, Date.now))),
    );
  });
