import { Command } from "@commander-js/extra-typings";
import { VERSION } from "../../version.ts";

export const versionCommand = new Command("version").action(() => console.log(VERSION));
