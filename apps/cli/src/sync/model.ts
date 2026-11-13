import type { TClient } from "../client/request.ts";
import type { TFetch } from "../client/fetch.ts";

export interface ISyncOptions {
  now: () => number;
  fetcher: TFetch;
  cwd?: string;
  all?: boolean;
  yes?: boolean;
  interactive?: boolean;
  confirm?: (keys: string[]) => Promise<boolean>;
  unlock?: (client: TClient, vaultId: Uint8Array) => Promise<void>;
  report?: (message: string) => void;
}
