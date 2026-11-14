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

export function checkQuota(context: TContext, vault: Uint8Array, before: number): void {
  checkGrowthQuota(context, vault, before, vaultUsage(context, vault));
}

export function checkGrowthQuota(
  context: TContext,
  vault: Uint8Array,
  before: number,
  after: number,
  limit = 1073741824,
): void {
  if (!isImport(context, vault) && after > limit && after > before)
    throw new EnvdenError("STORAGE_QUOTA", "Vault storage quota exceeded");
}

function isImport(context: TContext, vault: Uint8Array): boolean {
  const row = context.db
    .query<{ active: number; repair: Uint8Array | null }, [Uint8Array]>(
      "SELECT active,repair FROM vaults WHERE id=?",
    )
    .get(vault);

  return !!row && (!row.active || row.repair !== null);
}
