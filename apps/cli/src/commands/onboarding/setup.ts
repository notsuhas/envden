import { EnvdenError } from "@envden/core/errors";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runSetup } from "../../onboarding/setup.ts";
import { missingSetupFlags } from "./missing-setup-flags.ts";
import { withPreferences } from "./options.ts";
import { setupSummary } from "../../output/render/devices/summary.ts";
import { realHome } from "../../output/home-path.ts";

export const setupCommand = withPreferences(
  new Command("setup")
    .description("Create a vault and configure this device")
    .option("--yes", "Take defaults; secrets and checkout approval still require your terminal")
    .option("--server <url>", "Use this server")
    .option("--kit-out <file>", "Write the recovery kit as JSON to a private file instead of a PDF")
    .option("--name <name>", "Device name")
    .option("--host-server", "Run the envden server on this machine; no setup token needed")
    .option(
      "--setup-token <token>",
      "Setup token, visible to other processes; use the prompt in a terminal",
    ),
)
  .option("--scan-root <path...>", "Roots to scan for repos")
  .option("--exclude-root <path...>", "Roots to skip")
  .action(async (options) => {
    const missing = missingSetupFlags(!!process.stdin.isTTY, options);

    if (missing.length) {
      console.error(`Missing choices: ${missing.join(", ")}. Or run setup in your own terminal.`);

      throw new EnvdenError("INVALID_INPUT", "Setup choices require your own terminal");
    }

    const adapters = createAdapters(undefined, Date.now);
    const state = await runSetup(adapters, options, Date.now);

    for (const line of setupSummary(state, await realHome(adapters.userHome))) console.log(line);
  });
