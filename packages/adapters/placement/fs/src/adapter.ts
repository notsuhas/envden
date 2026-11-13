import type { IPlacementAdapter, TPlacementMode } from "@envden/core/adapters";
import { resolve } from "node:path";
import { supported } from "./operations/supported.ts";
import { place } from "./operations/place.ts";
import { inspect } from "./operations/inspect.ts";

export function createFsPlacementAdapter(
  mode: TPlacementMode,
  checkoutRoot: string,
): IPlacementAdapter {
  const root = resolve(checkoutRoot);

  return {
    mode,
    supported: (dir) => supported(mode, dir),
    place: (storePath, checkoutPath) => place(mode, root, storePath, checkoutPath),
    inspect: (storePath, checkoutPath) => inspect(mode, root, storePath, checkoutPath),
  };
}
