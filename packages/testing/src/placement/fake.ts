import type { IPlacementAdapter } from "@envden/core/adapters";
import { unexpected } from "../fakes/operation.ts";

export function createFakePlacementAdapter(
  operations: { [K in keyof IPlacementAdapter]?: IPlacementAdapter[K] | undefined } = {},
): IPlacementAdapter {
  return {
    mode: operations.mode ?? "copy",
    supported: operations.supported?.bind(operations) ?? unexpected("placement.supported"),
    place: operations.place?.bind(operations) ?? unexpected("placement.place"),
    remove: operations.remove?.bind(operations) ?? unexpected("placement.remove"),
    inspect: operations.inspect?.bind(operations) ?? unexpected("placement.inspect"),
  };
}
