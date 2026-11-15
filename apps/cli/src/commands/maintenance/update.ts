import { refreshInstallation } from "../../updates/self/maintenance.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runUpdateCheck } from "../../updates/run.ts";
import { selfUpdate } from "../../updates/self.ts";
import { terminalJson } from "../../output/sanitize.ts";

export const updateCommand = new Command("update")
  .option("--check")
  .option("--post-install", "Refresh installed integrations")
  .action(async (options) => {
    const commandTime = Date.now();

    const adapters = createAdapters(undefined, Date.now);

    if (options.postInstall) {
      await refreshInstallation(adapters, process.execPath);

      return;
    }

    const result = options.check
      ? await runUpdateCheck(adapters, commandTime)
      : await selfUpdate(adapters, {
          fetcher: fetch,
          binary: process.execPath,
        });

    console.log(terminalJson(result));
  });
