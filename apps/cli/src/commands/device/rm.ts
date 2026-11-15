import { replacementKitOutput } from "../vault/output.ts";
import { exposureText } from "../../output/render/devices/devices.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { removeDevice } from "../../admin/devices/remove.ts";
import { secret, consent } from "../../output/prompts/questions.ts";

export const deviceRmCommand = new Command("rm")
  .description("Remove a device and re-key the vault so it can't read new changes")
  .argument("<device>", "Device name or ID")
  .option(
    "--kit-out <file>",
    "Write the new recovery kit as JSON to a private file instead of a PDF",
  )
  .option("--new-kit", "Also replace the recovery kit as part of the removal")
  .action(async (device, options) => {
    const adapters = createAdapters(undefined, Date.now);
    const output = replacementKitOutput(adapters, options.kitOut);

    const result = await removeDevice(
      adapters,
      device,
      () => secret("Master password"),
      Date.now,
      fetch,
      options.newKit,
      () => consent("This device held recovery keys. Replace the recovery kit in this removal?"),
      async (exposure) => {
        console.log(exposureText(exposure));

        return consent("Remove this device?");
      },
      output.show,
    ).catch(output.fail);

    console.log(
      result.kind === "finished"
        ? "Finished an interrupted removal; the recovery kit it showed is now active"
        : "Device removed",
    );
  });
