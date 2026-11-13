import { currentMaterial } from "../../shared/material.ts";
import * as p from "@envden/core/protocol";
import type { classifyMissingBlobs } from "@envden/core/chain";
import type { readHistory } from "../../../vault/history.ts";
import type { repairContext } from "../upload.ts";

export async function missingBlobNames(
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
  gaps: ReturnType<typeof classifyMissingBlobs>,
) {
  const { key, ring } = await currentMaterial(context, history);

  const keys = new Map([
    ...ring.older.map((e) => [e.epoch, e.key] as const),
    [ring.epoch, key] as const,
  ]);

  const name = (entry: p.IFileEntry) =>
    p.openFileName(entry.name, keys.get(entry.epoch)!, ring.idKey, {
      vaultId: context.vaultId,
      epoch: entry.epoch,
      fileId: entry.fileId,
      version: entry.version,
    });

  return {
    kind: "missing-blobs" as const,
    missing: gaps.missing.map(name),
    lost: gaps.lost.map(name),
  };
}
