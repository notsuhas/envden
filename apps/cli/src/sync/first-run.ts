import type { TAdapters } from "../adapters.ts";
import type { ISyncOptions } from "./model.ts";
import { firstSync } from "./engine.ts";

export function firstRun(
  adapters: TAdapters,
  options: ISyncOptions & {
    choose: (path: string) => Promise<"keep-mine" | "take-server" | "merge">;
  },
) {
  return firstSync(adapters, options, options.choose);
}
