import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { rotateVault } from "../../admin/devices/rotate.ts";
import { replaceRecoveryCode } from "./recovery-code.ts";

export const vaultCommand = new Command("vault")
  .description("Re-key the vault or replace the recovery code")
  .addCommand(
    new Command("rotate")
      .description("Re-key the vault so removed devices can't read new changes")
      .action(async () => {
        await rotateVault(createAdapters(undefined, Date.now), Date.now);
        console.log("Vault re-keyed; removed devices can't read new changes");
      }),
  )
  .addCommand(
    new Command("recovery-code")
      .description("Make a new recovery code; the old one stops working")
      .option(
        "--recovery-code-out <file>",
        "Write the new code to a new private file instead of showing it",
      )
      .action(async (options) => {
        await replaceRecoveryCode(
          createAdapters(undefined, Date.now),
          Date.now,
          options.recoveryCodeOut,
        );
      }),
  );
