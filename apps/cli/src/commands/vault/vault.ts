import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runVaultAdmin } from "../../admin/recovery/run.ts";

export const vaultCommand = new Command("vault")
  .addCommand(
    new Command("rotate").action(async () => {
      await runVaultAdmin(createAdapters(), "rotate", () => Date.now());
    }),
  )
  .addCommand(
    new Command("kit").addCommand(
      new Command("replace").action(async () => {
        await runVaultAdmin(createAdapters(), "replace", () => Date.now());
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
