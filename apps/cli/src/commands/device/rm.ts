import { replacementKitOutput } from "../vault/output.ts";
import { terminalJson } from "../../output/sanitize.ts";
import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { removeDevice } from "../../admin/devices/remove.ts";
import { secret, consent } from "../../output/questions.ts";

export const deviceRmCommand = new Command("rm")
  .argument("<device>")
  .option("--kit-out <file>", "Write the new recovery kit to a private file")
  .option("--new-kit", "Replace the recovery kit in the same swap")
  .action(async (device, options) => {
    const output = replacementKitOutput(options.kitOut);

    const result = await removeDevice(
      createAdapters(undefined, Date.now),
      device,
      () => secret("Master password"),
      Date.now,
      fetch,
      options.newKit,
      () => consent("This device held recovery keys. Replace the recovery kit in this removal?"),
      async (exposure) => {
        console.log(terminalJson(exposure));

        return consent(
          "Remove this device and rotate keys? Previously exposed values need rotation.",
        );
      },
      output.show,
    ).catch(output.fail);

    console.log(
      result.kind === "finished"
        ? "Finished an interrupted removal; the recovery kit it showed is now active"
        : "Device removed",
    );
  });
