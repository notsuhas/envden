import type { TAdapters } from "../../adapters.ts";
import type { restoreVersion } from "../../history/restore/run.ts";

interface IRestoreTarget {
  root: string;
  path: string;
  version: number;
}

// Pressing the page's confirm button is the explicit confirmation the gate asks for.
export function dashboardRestoreOptions(
  adapters: TAdapters,
  now: () => number,
  target: IRestoreTarget,
): Parameters<typeof restoreVersion>[1] {
  return {
    cwd: target.root,
    file: target.path,
    version: target.version,
    yes: true,
    interactive: true,
    confirm: () => Promise.resolve(true),
    now,
    fetcher: adapters.fetcher,
  };
}
