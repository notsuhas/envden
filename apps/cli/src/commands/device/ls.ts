import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { listDevices } from "../../admin/devices/list.ts";

export const deviceLsCommand = new Command("ls")
  .description("List devices and the version each last used")
  .action(async () => {
    console.table(await listDevices(createAdapters(undefined, Date.now), Date.now));
  });
