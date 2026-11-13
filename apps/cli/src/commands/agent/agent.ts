import { Command } from "@commander-js/extra-typings";
import { agentInstallCommand } from "./install.ts";

export const agentCommand = new Command("agent")
  .description("Install the envden agent skill")
  .addCommand(agentInstallCommand);
