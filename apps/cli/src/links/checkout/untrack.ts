import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import { withStateLock } from "../../state/lock/lock.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { refreshNotice } from "../../notice/cache.ts";

export async function untrack(adapters: TAdapters, path: string) {
  return withStateLock(adapters.home, async () => {
    const state = await loadState(adapters.home);
    const root = (await adapters.repo.checkoutAt(path))?.root;

    if (!root || !state?.approved.some((item) => item.root === root))
      throw new EnvdenError("NOT_FOUND", "Checkout is not tracked");

    for (const link of state.links.filter((item) => item.root === root)) {
      const placement = adapters.placement("copy", root);
      const destination = join(root, link.path);
      const status = await placement.inspect(link.store, destination);

      if (status === "linked" || status === "relinkable")
        await placement.place(link.store, destination);
    }

    state.links = state.links.filter((item) => item.root !== root);
    state.approved = state.approved.filter((item) => item.root !== root);
    await saveState(adapters.home, state);
    await refreshNotice(adapters.home, state);
  });
}
