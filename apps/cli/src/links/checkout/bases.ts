import { rm } from "node:fs/promises";
import { basePath } from "../../sync/local/files.ts";
import type { ILocalState } from "../../state/model.ts";

export async function removeCheckoutBases(
  home: string,
  removed: ILocalState["links"],
  remaining: ILocalState["links"],
) {
  for (const link of removed) {
    const bases = [basePath(home, link.store, link.root)];

    if (!remaining.some((item) => item.store === link.store))
      bases.push(basePath(home, link.store));

    for (const base of bases) {
      await rm(base, { force: true });
      await rm(base + ".history", { recursive: true, force: true });
    }
  }
}
