import { same } from "../../sync/local/files.ts";

export function matchingVersion(
  versions: readonly { version: number; content: Uint8Array | undefined }[],
  bytes: Uint8Array | undefined,
) {
  return versions.find((item) => same(item.content, bytes))?.version;
}
