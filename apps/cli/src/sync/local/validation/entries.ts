import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type * as p from "@envden/core/protocol";
import type { TSyncContext } from "../../remote/context.ts";
import { entryName } from "../../remote/content.ts";
import { pathCollisions } from "./collisions.ts";

export async function collisionEntries(context: TSyncContext, repos: Set<string>) {
  const collisions = new Set<p.IFileEntry>();
  const store = join(context.adapters.home, "store");
  await mkdir(store, { recursive: true, mode: 0o700 });
  const storeInsensitive = await context.adapters.repo.caseInsensitive(store);

  for (const repoId of repos) {
    const roots = context.state.approved.filter(
      (item) => (context.state.aliases[item.repoId] ?? item.repoId) === repoId,
    );

    const cases = await Promise.all(
      roots.map((item) => context.adapters.repo.caseInsensitive(item.root)),
    );

    const entries = context.checkpoint.files.entries.filter(
      (entry) => entryName(context, entry).repoId === repoId,
    );

    const paths = entries.map((entry) => entryName(context, entry).path);

    for (const index of pathCollisions(paths, storeInsensitive || cases.some(Boolean)))
      collisions.add(entries[index]!);
  }

  return collisions;
}
