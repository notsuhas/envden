import { apply } from "./transitions/apply.ts";
import type { ISigned, TEntry } from "../../protocol/index.ts";
import type { IDeviceListState, TDeviceListResult } from "./state.ts";

export function applyEntry(
  state: IDeviceListState | undefined,
  entry: ISigned<TEntry>,
): TDeviceListResult {
  try {
    return { kind: "valid", state: apply(state, entry) };
  } catch {
    return { kind: "invalid" };
  }
}

export function verifyChain(entries: readonly ISigned<TEntry>[]): TDeviceListResult {
  let state: IDeviceListState | undefined;

  for (const entry of entries) {
    const result = applyEntry(state, entry);
    if (result.kind === "invalid") return result;
    state = result.state;
  }

  return state ? { kind: "valid", state } : { kind: "invalid" };
}
