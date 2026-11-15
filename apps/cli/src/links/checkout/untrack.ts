import {
  readDeletion,
  requestDeletion,
} from "../../sync/local/reconciliation/operation/deletion.ts";
import { readBytes } from "../../sync/local/files.ts";
import { removeConflictTargets } from "../../sync/local/conflicts.ts";
import { removeCheckoutBases } from "./bases.ts";
import { symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { regularTarget } from "../takeover/target.ts";
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
      const intent = await readDeletion(adapters.home, link.store, adapters.now);

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
          adapters.now,
        );

        if (!remaining) cancelled.push(...intent.targets);
      }

      await detachFile(adapters, link);
    }

    await removeCheckoutBases(
      adapters.home,
      state.links.filter((item) => item.root === root),
      state.links.filter((item) => item.root !== root),
      adapters.now,
    );

    await removeConflictTargets(adapters.home, root, adapters.now);

    state.links = state.links.filter((item) => item.root !== root);
    state.approved = state.approved.filter((item) => item.root !== root);
    await saveState(adapters.home, state, adapters.now);

    await refreshNotice(
      adapters.home,
      state,
      (root) => adapters.repo.caseInsensitive(root, true),
      adapters.now,
    );

    return cancelled;
  });
}

async function detachFile(
  adapters: TAdapters,
  link: Parameters<typeof removeCheckoutBases>[1][number],
) {
  const placement = adapters.placement("copy", link.root);
  const destination = join(link.root, link.path);
  const status = await placement.inspect(link.store, destination);

  if (status !== "linked" && status !== "relinkable") return;

  if (
    link.originalLink &&
    (await regularTarget(resolve(dirname(destination), link.originalLink)))
  ) {
    await placement.remove(link.store, destination);
    await symlink(link.originalLink, destination);
  } else if ((await readBytes(link.store)) === undefined)
    await placement.remove(link.store, destination);
  else await placement.place(link.store, destination);
}
