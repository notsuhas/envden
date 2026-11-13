import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { installAgent } from "../../agent/install.ts";

export const agentInstallCommand = new Command("install").action(async () => {
  await installAgent(createAdapters().userHome);
  console.log("Agent skill installed");
});
