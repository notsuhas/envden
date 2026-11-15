import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { listDevices } from "../../admin/devices/list.ts";
import { terminalJson } from "../../output/sanitize.ts";
import { deviceListText } from "../../output/render/devices/device-list.ts";

export const deviceLsCommand = new Command("ls")
  .description("List devices and the version each last used")
  .option("--json", "Print the result as JSON")
  .option("--verbose", "Include device ids")
  .action(async (options) => {
    const devices = await listDevices(createAdapters(undefined, Date.now), Date.now);

    console.log(options.json ? terminalJson(devices) : deviceListText(devices, !!options.verbose));
  });
