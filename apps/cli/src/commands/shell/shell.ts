import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { manageShell } from "../../agent/shell.ts";
import { shellChoice } from "../../output/questions.ts";

export const shellCommand = new Command("shell").description("Manage the shell notice");

for (const action of ["install", "uninstall"] as const)
  shellCommand.addCommand(
    new Command(action).argument("[shell]").action(async (shell) => {
      await manageShell(createAdapters(), action, shell ?? (await shellChoice()));
    }),
  );
