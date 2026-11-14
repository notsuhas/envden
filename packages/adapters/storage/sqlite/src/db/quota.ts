import { EnvdenError } from "@envden/core/errors";
import type { TContext } from "./context.ts";

export function vaultUsage(context: TContext, vault: Uint8Array): number {
  return context.db
    .query<{ size: number }, [Uint8Array, Uint8Array, Uint8Array, Uint8Array]>(`
    SELECT (SELECT COALESCE(SUM(size),0) FROM blob_usage WHERE vault=?)
      + (SELECT COALESCE(SUM(length(bytes)),0) FROM lists WHERE vault=?)
      + (SELECT COALESCE(SUM(length(bytes)),0) FROM state WHERE vault=? AND kind='keyring')
      + (SELECT COALESCE(SUM(length(list)+length(file)+length(version)+COALESCE(length(blob),0)+1),0) FROM versions WHERE vault=?) AS size
  `)
    .get(vault, vault, vault, vault)!.size;
}

export function checkQuota(context: TContext, vault: Uint8Array): void {
  if (vaultUsage(context, vault) > 1073741824)
    throw new EnvdenError("STORAGE_QUOTA", "Vault storage quota exceeded");
}
