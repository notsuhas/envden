import { Command } from "@commander-js/extra-typings";
import { VERSION } from "../../version.ts";

export const versionCommand = new Command("version")
  .description("Print the version")
  .action(() => console.log(VERSION));
