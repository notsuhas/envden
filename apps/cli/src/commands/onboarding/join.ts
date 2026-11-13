import { loadState } from "../../state/repository.ts";
import { runRejoin } from "../../admin/rejoin/run.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runJoin } from "../../onboarding/join.ts";

export const joinCommand = new Command("join")
  .argument("<server>")
  .description("Join using a pairing code or recovery kit in your own terminal")
  .option("--yes", "Take non-secret defaults")
  .option("--recovery-kit <path>", "Recovery kit path")
  .option("--name <name>", "Device name")
  .option("--resume", "Fetch the committed approver message")
  .action(async (server, options) => {
    const adapters = createAdapters();

    if ((await loadState(adapters.home))?.checkpoint)
      await runRejoin(adapters, server, options, () => Date.now());
    else await runJoin(adapters, server, options, () => Date.now());
  });
