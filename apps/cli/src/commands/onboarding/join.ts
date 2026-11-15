import { loadState } from "../../state/store/repository.ts";
import { runRejoin } from "../../admin/rejoin/run.ts";
import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runJoin } from "../../onboarding/join.ts";
import { SHELLS, TOGGLES } from "../../onboarding/decisions.ts";

export const joinCommand = new Command("join")
  .argument("<server>", "Server address, e.g. https://envden.your-tailnet.ts.net")
  .description("Join using a pairing code or recovery kit in your own terminal")
  .option("--recovery", "Paste a recovery secret key and vault ID")
  .option("--recovery-kit <path>", "Recovery kit path")
  .option("--name <name>", "Device name")
  .option("--yes", "Use default preferences")
  .addOption(new Option("--telemetry <choice>", "Anonymous telemetry").choices(TOGGLES))
  .addOption(new Option("--update-check <choice>", "Daily update check").choices(TOGGLES))
  .addOption(new Option("--shell <shell>", "Shell notice").choices([...SHELLS, "none"] as const))
  .addOption(new Option("--agent <choice>", "Agent skill").choices(TOGGLES))
  .option("--resume", "Fetch the committed approver message")
  .action(async (server, options) => {
    const adapters = createAdapters(undefined, Date.now);

    if ((await loadState(adapters.home))?.checkpoint)
      await runRejoin(adapters, server, options, Date.now);
    else await runJoin(adapters, server, options, Date.now);
  });
