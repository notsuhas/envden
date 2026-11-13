import type { IFileEntry } from "@envden/core/protocol";

export function storedVersions(entries: readonly IFileEntry[]) {
  return entries.map((e) => ({
    fileId: e.fileId,
    version: e.version,
    tombstone: [2, 4].includes(e.state),
    ...([1, 3].includes(e.state) ? { blobHash: e.blobHash } : {}),
  }));
}
