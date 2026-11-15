import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runVaultAdmin } from "./run.ts";

export const vaultCommand = new Command("vault")
  .description("Rotate keys, replace the recovery kit, or change or reset the password")
  .addCommand(
    new Command("rotate").description("Start a new encryption epoch").action(async () => {
      await runVaultAdmin(createAdapters(undefined, Date.now), "rotate", Date.now);
    }),
  )
  .addCommand(
    new Command("kit").description("Manage the recovery kit").addCommand(
      new Command("replace")
        .description("Replace a lost kit; needs the master password")
        .option("--kit-out <file>", "Write the new recovery kit to a private file")
        .action(async (options) => {
          await runVaultAdmin(
            createAdapters(undefined, Date.now),
            "replace",
            Date.now,
            undefined,
            options.kitOut,
          );
        }),
    ),
  )
  .addCommand(
    new Command("password")
      .description("Change or reset the master password")
      .addCommand(
        new Command("change")
          .description("Change the password; needs the old one and the kit")
          .action(async () => {
            await runVaultAdmin(createAdapters(undefined, Date.now), "change", Date.now);
          }),
      )
      .addCommand(
        new Command("reset")
          .description("Reset a forgotten password with the kit")
          .action(async () => {
            await runVaultAdmin(createAdapters(undefined, Date.now), "reset", Date.now);
          }),
      ),
  );
