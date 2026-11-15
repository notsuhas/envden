import { join } from "node:path";
import type { TAdapters } from "../../adapters.ts";
import { readBytes, same } from "../../sync/local/files.ts";
import type { IHistoryTarget } from "./select.ts";

export async function checkoutBytes(adapters: TAdapters, target: IHistoryTarget) {
  const destination = join(target.root, target.path);
  if (target.link?.mode !== "link") return { bytes: await readBytes(destination), detached: false };

  const status = await adapters
    .placement("link", target.root)
    .inspect(target.link.store, destination);

  const stored = await readBytes(target.link.store);
  if (status !== "detached") return { bytes: stored, detached: false };

  const placed = await readBytes(destination);

  return { bytes: placed, detached: !same(placed, stored) };
}
