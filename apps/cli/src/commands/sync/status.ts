import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { commandNotice } from "../../notice/command.ts";
import { localStatus } from "../../status/local.ts";

export const statusCommand = new Command("status")
  .option("--json", "Machine-readable status")
  .addOption(new Option("--refresh-cache").hideHelp())
  .action(async (options) => {
    const adapters = createAdapters();
    const notice = await commandNotice(adapters, Date.now(), fetch, !!options.refreshCache);
    const status = { ...(await localStatus(adapters)), ...notice };

    if (!options.refreshCache)
      console.log(
        options.json
          ? JSON.stringify(status)
          : status.configured
            ? [
                "envden: server unknown",
                ...notice.repos.map((repo) => `envden: ${repo} out of sync`),
              ].join("\n")
            : "envden: not configured",
      );
  });
