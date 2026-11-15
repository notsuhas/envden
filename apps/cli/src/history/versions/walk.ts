import * as p from "@envden/core/protocol";

interface IWalkedVersion {
  entry: p.IFileEntry;
  header: p.ISigned<p.IManifestHeader> | undefined;
}

interface IWalk {
  versions: IWalkedVersion[];
  pruned: boolean;
}

// Newest first; a version's header is the oldest one listing it, unknown once a list is pruned.
export async function walkVersions(
  headers: readonly p.ISigned<p.IManifestHeader>[],
  fileIds: readonly Uint8Array[],
  list: (filesHash: Uint8Array) => Promise<p.IFiles | undefined>,
) {
  const walks = new Map<string, IWalk>(
    fileIds.map((id) => [p.base32(id), { versions: [], pruned: false }]),
  );

  const open = new Map(fileIds.map((id) => [p.base32(id), id]));
  const lists = new Map<string, p.IFiles | undefined>();

  for (let index = headers.length - 1; index >= 0 && open.size > 0; index--) {
    const header = headers[index]!;
    const hash = p.base32(header.body.filesHash);
    if (!lists.has(hash)) lists.set(hash, await list(header.body.filesHash));
    const files = lists.get(hash);

    for (const [id, fileId] of open) {
      const walk = walks.get(id)!;
      const ended = stepWalk(walk, header, files, fileId);
      if (ended) open.delete(id);
    }
  }

  return walks;
}

function stepWalk(
  walk: IWalk,
  header: p.ISigned<p.IManifestHeader>,
  files: p.IFiles | undefined,
  fileId: Uint8Array,
) {
  const oldest = walk.versions.at(-1);

  if (!files) {
    walk.pruned = true;
    if (oldest) oldest.header = undefined;

    return true;
  }

  const entry = files.entries.find((item) => p.equal(item.fileId, fileId));
  if (!entry) return true;

  if (oldest?.entry.version === entry.version) oldest.header = header;
  else walk.versions.push({ entry, header });

  return false;
}
