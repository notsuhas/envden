import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TClient } from "../../client/request.ts";
import { text } from "../../client/encoding.ts";
import { optionalObject } from "../../admin/shared/transfer.ts";

export async function retainedList(client: TClient, filesHash: Uint8Array) {
  const bytes = await optionalObject(client, `/v1/files/${text(filesHash)}`);
  if (!bytes) return undefined;

  if (!p.equal(p.H("files", bytes), filesHash))
    throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

  return p.decode(p.FilesCodec, bytes);
}

export function retainedBlob(client: TClient, blobHash: Uint8Array) {
  return optionalObject(client, `/v1/blobs/${text(blobHash)}`);
}

export function openedName(
  entry: p.IFileEntry,
  keys: ReadonlyMap<number, Uint8Array>,
  idKey: Uint8Array,
  vaultId: Uint8Array,
) {
  const key = keys.get(entry.epoch);
  if (!key) return undefined;

  try {
    return p.openFileName(entry.name, key, idKey, { ...entry, vaultId });
  } catch {
    return undefined;
  }
}
