import { Command } from "@commander-js/extra-typings";
import { createAdapters } from "../../adapters.ts";
import { setupCheckouts } from "../../onboarding/scan.ts";
import { loadState } from "../../state/store/repository.ts";
import { requireConfigured } from "../../state/configured.ts";
import { withStateLock } from "../../state/lock/lock.ts";

export const trackCommand = new Command("track")
  .argument("[path]", "Checkout or scan root", process.cwd())
  .description("Scan, approve and link checkout env files")
  .option("--copy", "Place real copies instead of links")
  .action(async (path, options) => {
    const adapters = createAdapters();

    await withStateLock(adapters.home, async () => {
      const state = requireConfigured(await loadState(adapters.home), "Run setup or join first");

      await setupCheckouts(adapters, state, {
        scanRoot: [path],
        copy: !!options.copy,
        now: () => Date.now(),
      });
    });
  });
