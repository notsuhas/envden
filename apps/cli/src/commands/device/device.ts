import { Command } from "@commander-js/extra-typings";
import { deviceAddCommand } from "./add.ts";
import { deviceLsCommand } from "./ls.ts";
import { deviceRmCommand } from "./rm.ts";

export const deviceCommand = new Command("device")
  .description("Add, list and remove devices")
  .addCommand(deviceAddCommand)
  .addCommand(deviceLsCommand)
  .addCommand(deviceRmCommand);
