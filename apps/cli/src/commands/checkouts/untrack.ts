import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { untrack } from "../../links/checkout/untrack.ts";

export const untrackCommand = new Command("untrack")
  .argument("<path>")
  .description("Stop tracking a checkout and restore regular env files")
  .action(async (path) => {
    await untrack(createAdapters(), path);
  });
