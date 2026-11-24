import { Command } from "@commander-js/extra-typings";
import { deviceApproveCommand } from "./approve.ts";
import { deviceLsCommand } from "./ls.ts";
import { deviceRenameCommand } from "./rename.ts";
import { deviceRmCommand } from "./rm.ts";

export const deviceCommand = new Command("device")
  .description("Approve, list, rename and remove devices")
  .addCommand(deviceApproveCommand)
  .addCommand(deviceLsCommand)
  .addCommand(deviceRenameCommand)
  .addCommand(deviceRmCommand);
