import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runVaultAdmin } from "./run.ts";

export const vaultCommand = new Command("vault")
  .description("Re-key the vault, replace the recovery kit, or change or reset the password")
  .addCommand(
    new Command("rotate")
      .description("Re-key the vault so removed devices can't read new changes")
      .action(async () => {
        await runVaultAdmin(createAdapters(undefined, Date.now), "rotate", Date.now);
      }),
  )
  .addCommand(
    new Command("kit").description("Manage the recovery kit").addCommand(
      new Command("replace")
        .description("Replace a lost kit; needs the master password")
        .option(
          "--kit-out <file>",
          "Write the new recovery kit as JSON to a private file instead of a PDF",
        )
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
