import { loadState } from "../../state/store/repository.ts";
import { runRejoin } from "../../admin/rejoin/run.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runJoin } from "../../onboarding/join.ts";
import { requireServerAddress } from "../../onboarding/decisions.ts";
import { withPreferences } from "./options.ts";

export const joinCommand = withPreferences(
  new Command("join")
    .argument("<server>", "Server address, e.g. envden.your-tailnet.ts.net")
    .description("Join using a pairing code or recovery kit in your own terminal")
    .option("--recovery", "Paste a recovery secret key and vault ID")
    .option("--recovery-kit <path>", "Recovery kit path")
    .option("--name <name>", "Device name")
    .option("--yes", "Use default preferences"),
)
  .option("--resume", "Finish a join that was approved while this command wasn't running")
  .action(async (server, options) => {
    const adapters = createAdapters(undefined, Date.now);
    const address = requireServerAddress(server);

    if ((await loadState(adapters.home))?.checkpoint)
      await runRejoin(adapters, address, options, Date.now);
    else await runJoin(adapters, address, options, Date.now);
  });
