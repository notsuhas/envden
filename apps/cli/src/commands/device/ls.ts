import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { listDevices } from "../../admin/devices/list.ts";

export const deviceLsCommand = new Command("ls").action(async () => {
  console.table(await listDevices(createAdapters(undefined, Date.now), Date.now));
});
