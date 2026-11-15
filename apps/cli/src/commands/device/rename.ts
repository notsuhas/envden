import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { renameDevice } from "../../admin/devices/rename.ts";
import { sanitizeTerminal } from "../../output/sanitize.ts";

export const deviceRenameCommand = new Command("rename")
  .description("Rename this device")
  .argument("<name>", "New name, unique in the vault")
  .action(async (name) => {
    const result = await renameDevice(createAdapters(undefined, Date.now), name, Date.now);

    console.log(
      result.kind === "unchanged"
        ? "This device already has that name"
        : `This device is now ${sanitizeTerminal(name)}`,
    );
  });
