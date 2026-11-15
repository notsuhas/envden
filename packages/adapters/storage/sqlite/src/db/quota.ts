import { EnvdenError } from "@envden/core/errors";
import type { IFileVersion } from "@envden/core/adapters";
import type { TContext } from "./context.ts";
import { hex } from "./values.ts";

interface IListContent {
  size: number;
  blobs: Set<string>;
}

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

// Deletions stay possible over quota: they add no blob and no bigger list.
export function addsContent(
  prior: IListContent | undefined,
  next: { bytes: Uint8Array; versions: IFileVersion[] },
) {
  return (
    !prior ||
    next.bytes.length > prior.size ||
    next.versions.some((v) => !!v.blobHash && !prior.blobs.has(hex(v.blobHash)))
  );
}

export function listContent(
  context: TContext,
  vault: Uint8Array,
  list: Uint8Array,
): IListContent | undefined {
  const size = context.db
    .query<{ size: number }, [Uint8Array, Uint8Array]>(
      "SELECT length(bytes) AS size FROM lists WHERE vault=? AND hash=?",
    )
    .get(vault, list)?.size;

  if (size === undefined) return undefined;

  const blobs = context.db
    .query<{ blob: Uint8Array }, [Uint8Array, Uint8Array]>(
      "SELECT blob FROM versions WHERE vault=? AND list=? AND blob IS NOT NULL",
    )
    .all(vault, list);

  return { size, blobs: new Set(blobs.map((row) => hex(row.blob))) };
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
