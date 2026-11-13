import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { diff } from "../../sync/diff.ts";
import { syncOptions } from "../../sync/command.ts";

export const diffCommand = new Command("diff").option("--all").action(async (options) => {
  console.log(JSON.stringify(await diff(createAdapters(), syncOptions(options))));
});
