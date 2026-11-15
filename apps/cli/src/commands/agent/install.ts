import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { installAgent } from "../../agent/install.ts";

export const agentInstallCommand = new Command("install").action(async () => {
  const commandTime = Date.now();

  await installAgent(createAdapters(undefined, () => commandTime).userHome, () => commandTime);
  console.log("Agent skill installed");
});
