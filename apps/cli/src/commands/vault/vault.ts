import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runVaultAdmin } from "./run.ts";

export const vaultCommand = new Command("vault")
  .addCommand(
    new Command("rotate").action(async () => {
      const commandTime = Date.now();

      await runVaultAdmin(
        createAdapters(undefined, () => commandTime),
        "rotate",
        () => commandTime,
      );
    }),
  )
  .addCommand(
    new Command("kit").addCommand(
      new Command("replace")
        .option("--kit-out <file>", "Write the new recovery kit to a private file")
        .action(async (options) => {
          const commandTime = Date.now();

          await runVaultAdmin(
            createAdapters(undefined, () => commandTime),
            "replace",
            () => commandTime,
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
          const commandTime = Date.now();

          await runVaultAdmin(
            createAdapters(undefined, () => commandTime),
            "change",
            () => commandTime,
          );
        }),
      )
      .addCommand(
        new Command("reset").action(async () => {
          const commandTime = Date.now();

          await runVaultAdmin(
            createAdapters(undefined, () => commandTime),
            "reset",
            () => commandTime,
          );
        }),
      ),
  );
