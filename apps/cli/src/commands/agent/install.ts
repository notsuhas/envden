import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { installAgent } from "../../agent/install.ts";

export const agentInstallCommand = new Command("install").action(async () => {
  await installAgent(createAdapters(undefined, Date.now).userHome, Date.now);
  console.log("Agent skill installed");
});
