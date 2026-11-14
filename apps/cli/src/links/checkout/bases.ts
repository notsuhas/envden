import { preservePendingAncestor } from "../../sync/local/reconciliation/operation/file.ts";
import { rm } from "node:fs/promises";
import { basePath } from "../../sync/local/files.ts";
import type { ILocalState } from "../../state/model.ts";

export async function removeCheckoutBases(
  home: string,
  removed: ILocalState["links"],
  remaining: ILocalState["links"],
) {
  for (const link of removed) {
    await preservePendingAncestor(home, link.store);
    await rm(basePath(home, link.store) + ".pending", { force: true });
    await rm(basePath(home, link.store) + ".corrupt", { force: true });
    const bases = [basePath(home, link.store, link.root)];

    if (!remaining.some((item) => item.store === link.store))
      bases.push(basePath(home, link.store));

    for (const base of bases) {
      await rm(base, { force: true });
      await rm(base + ".history", { recursive: true, force: true });
    }
  }
}
