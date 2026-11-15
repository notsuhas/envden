import type { TAdapters } from "../../adapters.ts";
import type { ISyncOptions } from "../../sync/model.ts";

// The button press confirms clean merges; anything needing a choice stays a conflict.
export function dashboardSyncOptions(adapters: TAdapters, now: () => number): ISyncOptions {
  return { now, fetcher: adapters.fetcher, all: true, yes: true, interactive: false };
}
