import { Command } from "@commander-js/extra-typings";
import { deviceAddCommand } from "./add.ts";
import { deviceLsCommand } from "./ls.ts";
import { deviceRenameCommand } from "./rename.ts";
import { deviceRmCommand } from "./rm.ts";

export const deviceCommand = new Command("device")
  .description("Add, list, rename and remove devices")
  .addCommand(deviceAddCommand)
  .addCommand(deviceLsCommand)
  .addCommand(deviceRenameCommand)
  .addCommand(deviceRmCommand);
