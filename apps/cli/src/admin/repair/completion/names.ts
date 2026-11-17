import { currentMaterial, epochKey } from "../../shared/material.ts";
import * as p from "@envden/core/protocol";
import type { classifyMissingBlobs } from "@envden/core/chain";
import type { readHistory } from "../../../vault/history.ts";
import type { repairContext } from "../upload.ts";

export async function missingBlobNames(
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
  gaps: ReturnType<typeof classifyMissingBlobs>,
) {
  const { ring, keys } = await currentMaterial(context, history);

  const name = (entry: p.IFileEntry) =>
    p.openFileName(entry.name, epochKey(keys, entry.epoch), ring.idKey, {
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
