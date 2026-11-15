import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { untrack } from "../../links/checkout/untrack.ts";

export const untrackCommand = new Command("untrack")
  .argument("<path>", "Checkout root")
  .description("Stop tracking a checkout and restore regular env files")
  .action(async (path) => {
    const cancelled = await untrack(createAdapters(undefined, Date.now), path);

    for (const file of cancelled) console.log(`Cancelled removal: ${file}`);
  });
