import { Command } from "@commander-js/extra-typings";
import metadata from "../../../package.json";

export const versionCommand = new Command("version").action(() => console.log(metadata.version));
