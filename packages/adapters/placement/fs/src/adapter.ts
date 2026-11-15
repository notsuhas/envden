import { placementFailure } from "./failures/operation.ts";
import type { IPlacementAdapter, TPlacementMode } from "@envden/core/adapters";
import { resolve } from "node:path";
import { supported } from "./operations/supported.ts";
import { place } from "./operations/place.ts";
import { remove } from "./operations/remove.ts";
import { inspect } from "./operations/inspect.ts";

export function createFsPlacementAdapter(
  mode: TPlacementMode,
  checkoutRoot: string,
  backupDirectory: string | undefined,
  now: () => number,
): IPlacementAdapter {
  const root = resolve(checkoutRoot);

  return {
    mode,
    supported: (dir) => supported(mode, dir).catch(placementFailure),
    place: (storePath, checkoutPath, prepareTemporary) =>
      place(
        mode,
        root,
        storePath,
        checkoutPath,
        backupDirectory,
        undefined,
        prepareTemporary,
        now,
      ).catch(placementFailure),
    remove: (storePath, checkoutPath) =>
      remove(root, storePath, checkoutPath).catch(placementFailure),
    inspect: (storePath, checkoutPath) =>
      inspect(mode, root, storePath, checkoutPath).catch(placementFailure),
  };
}
