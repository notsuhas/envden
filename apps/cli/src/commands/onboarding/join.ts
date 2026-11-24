import { loadState } from "../../state/store/repository.ts";
import { runRejoin } from "../../admin/rejoin/run.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runJoin } from "../../onboarding/join.ts";
import { requireServerAddress } from "../../onboarding/decisions.ts";
import { withPreferences } from "./options.ts";
import { joinSummary } from "../../output/render/devices/summary.ts";
import { realHome } from "../../output/home-path.ts";

export const joinCommand = withPreferences(
  new Command("join")
    .argument("<server>", "Server address, e.g. envden.your-tailnet.ts.net")
    .description(
      "Join a vault: approve this device from another one by comparing words, or use the recovery code",
    )
    .option("--recovery", "Join with the recovery code, when no other device is available")
    .option("--name <name>", "Device name")
    .option("--yes", "Use default preferences"),
)
  .option("--resume", "Finish a join that was approved while this command wasn't running")
  .action(async (server, options) => {
    const adapters = createAdapters(undefined, Date.now);
    const address = requireServerAddress(server);

    if ((await loadState(adapters.home))?.checkpoint) {
      await runRejoin(adapters, address, options, Date.now);

      return;
    }

    const state = await runJoin(adapters, address, options, Date.now);

    for (const line of joinSummary(state, await realHome(adapters.userHome))) console.log(line);
  });
