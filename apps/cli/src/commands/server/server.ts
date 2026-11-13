import { Command } from "@commander-js/extra-typings";
import { serverMoveCommand } from "./move.ts";
import { serverRepairCommand } from "./repair.ts";
import { serverSwitchCommand } from "./switch.ts";

export const serverCommand = new Command("server")
  .description("Move, switch or repair the server")
  .addCommand(serverMoveCommand)
  .addCommand(serverSwitchCommand)
  .addCommand(serverRepairCommand);
