import { equal, FilesCodec, H } from "../../protocol/index.ts";
import type { IFileEntry, IFiles, IManifestHeader } from "../../protocol/index.ts";
import { id } from "../shared/validation.ts";

export function chooseRecoveryCandidate(input: {
  fileId: Uint8Array;
  beforeVersion: bigint;
  history: readonly { header: IManifestHeader; files: IFiles | undefined }[];
  availableBlobs: ReadonlySet<string>;
}): { kind: "recovered"; entry: IFileEntry; header: IManifestHeader } | { kind: "lost" } {
  const history = [...input.history].sort((a, b) =>
    a.header.seq > b.header.seq ? -1 : a.header.seq < b.header.seq ? 1 : 0,
  );

  for (const { header, files } of history) {
    if (!files || !equal(H("files", FilesCodec.write(files)), header.filesHash))
      return { kind: "lost" };

    const entry = files.entries.find((e) => equal(e.fileId, input.fileId));
    if (!entry || entry.version >= input.beforeVersion) continue;
    if ([2, 4].includes(entry.state)) return { kind: "lost" };
    if (input.availableBlobs.has(id(entry.blobHash))) return { kind: "recovered", entry, header };
  }

  return { kind: "lost" };
}

export function repairLoginDecision(
  headersAfterRestoredHead: readonly IManifestHeader[],
): "register" | "login" {
  return headersAfterRestoredHead.some((h) => h.op === 8 || h.op === 9) ? "register" : "login";
}

export function refuseSecretKeyProof(
  headersAfterRestoredHead: readonly IManifestHeader[],
  envelopeMatchesHead: boolean,
): boolean {
  return !envelopeMatchesHead || headersAfterRestoredHead.some((h) => h.op === 5 || h.op === 7);
}

export function isReusedRepairToken(repairId: Uint8Array, repairIds: ReadonlySet<string>): boolean {
  return repairIds.has(id(repairId));
}
