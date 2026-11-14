import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../remote/context.ts";
import { basePath, readBytes } from "./files.ts";
import { recordConflict } from "./conflicts.ts";

export async function reconcileUnpublished(context: TSyncContext, repos: Set<string>) {
  let conflicts = 0;

  for (const link of context.state.links) {
    const checkout = context.state.approved.find((item) => item.root === link.root);
    if (!checkout || link.localOnly) continue;
    const repoId = context.state.aliases[checkout.repoId] ?? checkout.repoId;
    if (!repos.has(repoId)) continue;
    const id = p.fileId(context.checkpoint.idKey, repoId, link.path);
    if (context.checkpoint.files.entries.some((entry) => p.equal(entry.fileId, id))) continue;
    const destination = join(link.root, link.path);
    const placement = context.adapters.placement(link.mode, link.root);
    const status = await placement.inspect(link.store, destination);
    if (status === "relinkable") await placement.place(link.store, destination);
    if (status !== "detached") continue;

    await recordConflict(
      context,
      {
        ...link,
        base: basePath(
          context.adapters.home,
          link.store,
          link.mode === "copy" ? link.root : undefined,
        ),
      },
      await readBytes(destination),
      await readBytes(link.store),
    );

    conflicts++;
  }

  return conflicts;
}
