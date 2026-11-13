import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runDeviceAdd } from "../../onboarding/add.ts";

export const deviceAddCommand = new Command("add").action(async () => {
  await runDeviceAdd(createAdapters(), () => Date.now());
});
