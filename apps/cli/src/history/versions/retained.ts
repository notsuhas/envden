import * as p from "@envden/core/protocol";
import { join } from "node:path";
import { text } from "../../client/encoding.ts";
import { openedName, retainedBlob, retainedList } from "../../vault/files/retained.ts";
import { readBytes } from "../../sync/local/files.ts";
import type { THistorySource } from "./source.ts";
import { walkVersions } from "./walk.ts";

export interface IRetainedVersion {
  version: number;
  state: number;
  header: p.ISigned<p.IManifestHeader> | undefined;
  content: Uint8Array | undefined;
}

export async function retainedVersions(source: THistorySource, fileIds: readonly Uint8Array[]) {
  const walks = await walkVersions(source.history.headers, fileIds, (hash) =>
    retainedList(source.context.client, hash),
  );

  const result = new Map<string, { versions: IRetainedVersion[]; pruned: boolean }>();

  for (const [id, walk] of walks) {
    const versions: IRetainedVersion[] = [];
    let pruned = walk.pruned;

    for (const { entry, header } of walk.versions) {
      const name = openedName(entry, source.keys, source.idKey, source.context.vaultId);
      if (!name) continue;
      const content = await versionContent(source, entry, name);

      if (content === "pruned") {
        pruned = true;
        break;
      }

      versions.push({ version: Number(entry.version), state: entry.state, header, content });
    }

    result.set(id, { versions, pruned });
  }

  return result;
}

async function versionContent(source: THistorySource, entry: p.IFileEntry, name: p.IFileName) {
  if (entry.state === 2 || entry.state === 4) return undefined;

  const cached = await readBytes(
    join(source.context.adapters.home, "state", "blobs", text(entry.blobHash)),
  );

  const box = cached ?? (await retainedBlob(source.context.client, entry.blobHash));
  if (!box) return "pruned";

  return p.openFile(
    box,
    source.keys.get(entry.epoch)!,
    source.idKey,
    { ...entry, vaultId: source.context.vaultId },
    entry.blobHash,
    name,
  ).content;
}
