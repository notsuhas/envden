import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { withStateLock } from "../state/lock.ts";
import { loadState } from "../state/repository.ts";
import { aliasRepo } from "../links/alias.ts";

export async function aliasUnlinkedRepo(adapters: TAdapters, source: string, target: string) {
  return withStateLock(adapters.home, async () => {
    const state = await loadState(adapters.home);

    const roots = new Set(
      state?.approved.filter((item) => item.repoId === source).map((item) => item.root),
    );

    if (state?.links.some((item) => roots.has(item.root)))
      throw new EnvdenError(
        "CONFLICT",
        "Cannot alias a repo with placed files; run envden untrack <path> first",
      );

    await aliasRepo(adapters, source, target);
  });
}
