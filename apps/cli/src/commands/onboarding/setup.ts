import { EnvdenError } from "@envden/core/errors";
import { Command, Option } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runSetup } from "../../onboarding/setup.ts";
import { missingSetupFlags } from "./missing-setup-flags.ts";

export const setupCommand = new Command("setup")
  .description("Create a vault and configure this device")
  .option("--yes", "Take defaults; secrets and checkout approval still require your terminal")
  .option("--server <url>", "Use this server")
  .option("--kit-out <file>", "Write recovery kit to a private file")
  .option("--name <name>", "Device name")
  .option("--host-server", "Host a login service on this device")
  .option("--setup-token <token>", "Server setup token")
  .addOption(new Option("--telemetry <choice>", "Anonymous telemetry").choices(["on", "off"]))
  .addOption(new Option("--update-check <choice>", "Daily release check").choices(["on", "off"]))
  .addOption(
    new Option("--shell <shell>", "Shell hook").choices([
      "zsh",
      "bash",
      "fish",
      "powershell",
      "none",
    ]),
  )
  .addOption(new Option("--agent <choice>", "Install agent skill").choices(["on", "off"]))
  .option("--scan-root <path...>", "Roots to scan for repos")
  .option("--exclude-root <path...>", "Roots to skip")
  .action(async (options) => {
    const missing = missingSetupFlags(!!process.stdin.isTTY, options);

    if (missing.length) {
      console.error(
        `Missing choices: ${missing.join(", ")}. Run secret entry and checkout approval in your own terminal.`,
      );

      throw new EnvdenError("INVALID_INPUT", "Setup choices require your own terminal");
    }

    await runSetup(createAdapters(), options, () => Date.now());
  });
