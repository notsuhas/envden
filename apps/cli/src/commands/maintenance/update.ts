import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runUpdateCheck } from "../../updates/run.ts";
import { selfUpdate } from "../../updates/self.ts";
import { terminalJson } from "../../output/sanitize.ts";

export const updateCommand = new Command("update").option("--check").action(async (options) => {
  const adapters = createAdapters();

  const result = options.check
    ? await runUpdateCheck(adapters, Date.now())
    : await selfUpdate(adapters, {
        now: Date.now(),
        fetcher: fetch,
        binary: process.execPath,
      });

  console.log(terminalJson(result));
});
