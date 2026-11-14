import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../remote/context.ts";
import { basePath, readBytes, writeBytes, same } from "./files.ts";
import { recordConflict, backup } from "./conflicts.ts";

export async function reconcileUnpublished(context: TSyncContext, repos: Set<string>) {
  let conflicts = 0;

  for (const link of context.state.links) {
    const checkout = context.state.approved.find((item) => item.root === link.root);
    if (!checkout || link.localOnly || context.skippedRoots.has(link.root)) continue;
    const repoId = context.state.aliases[checkout.repoId] ?? checkout.repoId;
    if (!repos.has(repoId)) continue;
    const id = p.fileId(context.checkpoint.idKey, repoId, link.path);
    if (context.checkpoint.files.entries.some((entry) => p.equal(entry.fileId, id))) continue;
    const destination = join(link.root, link.path);
    const placement = context.adapters.placement(link.mode, link.root);
    const status = await placement.inspect(link.store, destination);
    if (status === "relinkable") await placement.place(link.store, destination);
    if (status !== "detached") continue;

    conflicts += await reconcileDetached(context, link, destination);
  }

  return conflicts;
}

async function reconcileDetached(
  context: TSyncContext,
  link: TSyncContext["state"]["links"][number],
  destination: string,
) {
  const base = basePath(
    context.adapters.home,
    link.store,
    link.mode === "copy" ? link.root : undefined,
  );

  const mine = await readBytes(destination);
  const stored = await readBytes(link.store);
  const previous = await readBytes(base + ".unpublished");

  if (link.mode === "copy" && previous !== undefined) {
    if (same(stored, previous) || same(mine, stored)) {
      await backup(context.adapters.home, link.store, context.options.now());
      await writeBytes(link.store, mine);
      await writeBytes(base + ".unpublished", mine);

      return 0;
    }

    if (stored !== undefined && same(mine, previous)) {
      await context.adapters.placement(link.mode, link.root).place(link.store, destination);
      await writeBytes(base + ".unpublished", stored);

      return 0;
    }
  }

  await recordConflict(
    context,
    {
      ...link,
      base,
    },
    await readBytes(destination),
    await readBytes(link.store),
  );

  return 1;
}
