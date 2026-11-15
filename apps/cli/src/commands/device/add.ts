import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runDeviceAdd } from "../../onboarding/add.ts";

export const deviceAddCommand = new Command("add")
  .description("Show a pairing code for a new device")
  .action(async () => {
    await runDeviceAdd(createAdapters(undefined, Date.now), Date.now);
  });
