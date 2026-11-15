import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { switchServer } from "../../admin/move/switch.ts";

export const serverSwitchCommand = new Command("switch")
  .argument("<server>")
  .action(async (server) => {
    const commandTime = Date.now();

    await switchServer(
      createAdapters(undefined, () => commandTime),
      server,
      () => commandTime,
    );

    console.log("Server switched");
  });
