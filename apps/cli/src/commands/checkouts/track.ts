import { Argument, Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { setupCheckouts } from "../../onboarding/scan.ts";
import { loadState } from "../../state/store/repository.ts";
import { requireConfigured } from "../../state/configured.ts";
import { withStateLock } from "../../state/lock/lock.ts";

export const trackCommand = new Command("track")
  .addArgument(
    new Argument("[path]", "Checkout or scan root").default(process.cwd(), "current directory"),
  )
  .description("Scan, approve and link checkout env files")
  .option("--copy", "Place real copies instead of links")
  .option("--verbose", "List each repo and env file the scan skipped")
  .action(async (path, options) => {
    const adapters = createAdapters(undefined, Date.now);

    await withStateLock(adapters.home, async () => {
      const state = requireConfigured(await loadState(adapters.home));

      await setupCheckouts(adapters, state, {
        scanRoot: [path],
        copy: !!options.copy,
        verbose: !!options.verbose,
        command: "track",
        now: Date.now,
      });
    });
  });
