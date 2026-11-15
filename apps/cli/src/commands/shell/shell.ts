import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { manageShell } from "../../agent/shell.ts";
import { shellChoice } from "../../output/questions.ts";

const SHELL_ACTIONS = {
  install: "Add the out-of-sync notice to your shell config",
  uninstall: "Remove the out-of-sync notice from your shell config",
};

export const shellCommand = new Command("shell").description("Manage the shell notice");

for (const action of ["install", "uninstall"] as const)
  shellCommand.addCommand(
    new Command(action)
      .description(SHELL_ACTIONS[action])
      .argument("[shell]", "zsh, bash, fish or powershell; asks if omitted")
      .action(async (shell) => {
        await manageShell(
          createAdapters(undefined, Date.now),
          action,
          shell ?? (await shellChoice()),
        );
      }),
  );
