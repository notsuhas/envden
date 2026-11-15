import { Command } from "@commander-js/extra-typings";
import { resolve, relative } from "node:path";
import { createAdapters } from "../../adapters.ts";
import { loadState } from "../../state/store/repository.ts";
import { requireConfigured } from "../../state/configured.ts";
import { markLocalOnly } from "../../links/local-only.ts";
import { withStateLock } from "../../state/lock/lock.ts";
import { EnvdenError } from "@envden/core/errors";

export const localOnlyCommand = new Command("local-only")
  .argument("<file>")
  .description("Keep a managed file local to this checkout")
  .action(async (file) => {
    const commandTime = Date.now();
    const adapters = createAdapters(undefined, () => commandTime);
    const absolute = resolve(file);

    await withStateLock(adapters.home, async () => {
      const state = requireConfigured(await loadState(adapters.home), "Run setup or join first");
      const link = state.links.find((item) => resolve(item.root, item.path) === absolute);
      if (!link) throw new EnvdenError("NOT_FOUND", "File is not managed by envden");
      await markLocalOnly(adapters, state, link.root, relative(link.root, absolute));
    });
  });
