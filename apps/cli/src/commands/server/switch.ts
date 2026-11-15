import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { switchServer } from "../../admin/move/switch.ts";

export const serverSwitchCommand = new Command("switch")
  .argument("<server>")
  .action(async (server) => {
    await switchServer(createAdapters(undefined, Date.now), server, Date.now);

    console.log("Server switched");
  });
