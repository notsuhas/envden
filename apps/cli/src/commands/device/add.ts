import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { runDeviceAdd } from "../../onboarding/add.ts";

export const deviceAddCommand = new Command("add").action(async () => {
  const commandTime = Date.now();

  await runDeviceAdd(
    createAdapters(undefined, () => commandTime),
    () => commandTime,
  );
});
