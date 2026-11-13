import { Command } from "@commander-js/extra-typings";
import { EnvdenError } from "@envden/core/errors";
import { createAdapters } from "../../adapters.ts";
import { runUpdateCheck } from "../../updates/run.ts";

export const updateCommand = new Command("update").option("--check").action(async (options) => {
  if (!options.check) throw new EnvdenError("NOT_IMPLEMENTED", "Self-update is not implemented");
  console.log(JSON.stringify(await runUpdateCheck(createAdapters(), Date.now())));
});
