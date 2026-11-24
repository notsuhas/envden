import type { TFetch } from "../client/fetch.ts";

export interface ISyncOptions {
  choose?: (path: string) => Promise<"keep-mine" | "take-server" | "merge">;
  now: () => number;
  fetcher: TFetch;
  cwd?: string;
  all?: boolean;
  yes?: boolean;
  fastForwardOnly?: boolean;
  interactive?: boolean;
  confirm?: (keys: string[]) => Promise<boolean>;
  report?: (message: string) => void;
}
