import { recoveryCodeOutput, requireCodeOutput } from "../../vault/recovery/show.ts";
import { exposureText } from "../../output/render/devices/devices.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { removeDevice } from "../../admin/devices/remove.ts";
import { consent } from "../../output/prompts/questions.ts";

export const deviceRmCommand = new Command("rm")
  .description("Remove a device and re-key the vault so it can't read new changes")
  .argument("<device>", "Device name or ID")
  .option("--new-code", "Also replace the recovery code as part of the removal")
  .option(
    "--recovery-code-out <file>",
    "Write a new recovery code to a new private file instead of showing it",
  )
  .action(async (device, options) => {
    const target = { path: options.recoveryCodeOut };
    if (options.newCode) requireCodeOutput(target);
    const output = recoveryCodeOutput(target);

    const result = await removeDevice(
      createAdapters(undefined, Date.now),
      device,
      Date.now,
      fetch,
      options.newCode,
      async () => {
        const replace = await consent(
          "This device held the recovery key. Replace the recovery code in this removal?",
        );

        if (replace) requireCodeOutput(target);

        return replace;
      },
      async (exposure) => {
        console.log(exposureText(exposure));

        return consent("Remove this device?");
      },
      output.show,
    ).catch(output.fail);

    console.log(
      result.kind === "finished"
        ? "Finished an interrupted removal; the recovery code it showed is now the one that works"
        : "Device removed",
    );
  });
