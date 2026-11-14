import {
  readDeletion,
  requestDeletion,
} from "../../sync/local/reconciliation/operation/deletion.ts";
import { removeConflictTargets } from "../../sync/local/conflicts.ts";
import { removeCheckoutBases } from "./bases.ts";
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

    const cancelled: string[] = [];

    for (const link of state.links.filter((item) => item.root === root)) {
      const intent = await readDeletion(adapters.home, link.store);

      if (intent) {
        const remaining = state.links.some(
          (item) => item.store === link.store && item.root !== root,
        );

        await requestDeletion(
          adapters.home,
          link.store,
          remaining,
          intent.entry,
          intent.targets.filter((path) => path !== join(root, link.path)),
        );

        if (!remaining) cancelled.push(...intent.targets);
      }

      const placement = adapters.placement("copy", root);
      const destination = join(root, link.path);
      const status = await placement.inspect(link.store, destination);

      if (status === "linked" || status === "relinkable")
        await placement.place(link.store, destination);
    }

    await removeCheckoutBases(
      adapters.home,
      state.links.filter((item) => item.root === root),
      state.links.filter((item) => item.root !== root),
    );

    await removeConflictTargets(adapters.home, root);

    state.links = state.links.filter((item) => item.root !== root);
    state.approved = state.approved.filter((item) => item.root !== root);
    await saveState(adapters.home, state);
    await refreshNotice(adapters.home, state, (root) => adapters.repo.caseInsensitive(root, true));

    return cancelled;
  });
}
