import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runVaultAdmin } from "./run.ts";

export const vaultCommand = new Command("vault")
  .addCommand(
    new Command("rotate").action(async () => {
      await runVaultAdmin(createAdapters(), "rotate", () => Date.now());
    }),
  )
  .addCommand(
    new Command("kit").addCommand(
      new Command("replace")
        .option("--kit-out <file>", "Write the new recovery kit to a private file")
        .action(async (options) => {
          await runVaultAdmin(
            createAdapters(),
            "replace",
            () => Date.now(),
            undefined,
            options.kitOut,
          );
        }),
    ),
  )
  .addCommand(
    new Command("password")
      .addCommand(
        new Command("change").action(async () => {
          await runVaultAdmin(createAdapters(), "change", () => Date.now());
        }),
      )
      .addCommand(
        new Command("reset").action(async () => {
          await runVaultAdmin(createAdapters(), "reset", () => Date.now());
        }),
      ),
  );
