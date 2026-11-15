import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { commandNotice } from "../../notice/command.ts";
import { realHome } from "../../output/home-path.ts";
import { terminalJson } from "../../output/sanitize.ts";
import { statusText } from "../../output/render/sync/status.ts";
import { statusReport } from "../../status/report.ts";

export const statusCommand = new Command("status")
  .description("Show what changed here, what's newer on the server and what needs attention")
  .option("--json", "Machine-readable status")
  .addOption(new Option("--refresh-cache").hideHelp())
  .action(async (options) => {
    const adapters = createAdapters(undefined, Date.now);

    if (options.refreshCache) {
      await commandNotice(adapters, Date.now(), fetch, true, process.cwd());

      return;
    }

    const report = await statusReport(adapters);

    await commandNotice(adapters, Date.now(), fetch, false, process.cwd(), true);

    console.log(
      options.json
        ? terminalJson(report)
        : statusText(report, { cwd: process.cwd(), userHome: await realHome(adapters.userHome) }),
    );
  });
