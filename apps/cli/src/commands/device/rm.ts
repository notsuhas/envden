import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { removeDevice } from "../../admin/devices/remove.ts";
import { secret } from "../../output/questions.ts";

export const deviceRmCommand = new Command("rm")
  .argument("<device>")
  .option("--new-kit", "Replace the recovery kit in the same swap")
  .action(async (device, options) => {
    const result = await removeDevice(
      createAdapters(),
      device,
      await secret("Master password"),
      () => Date.now(),
      fetch,
      options.newKit,
    );

    if (result.recommendNewKit)
      console.log("This device held recovery keys. Remove with --new-kit to replace them too.");

    console.log(JSON.stringify(result.exposure, null, 2));
    if (result.kit) console.log(JSON.stringify(result.kit, null, 2));
    console.log("Device removed");
  });
