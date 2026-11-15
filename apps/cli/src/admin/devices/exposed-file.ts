import * as p from "@envden/core/protocol";
import { parseEnv } from "@envden/core/merge";
import type { TAdminContext } from "../shared/context.ts";
import { text } from "../../client/encoding.ts";
import type { currentMaterial } from "../shared/material.ts";
import { optionalObject } from "../shared/transfer.ts";

export async function inspectExposedFile(
  context: TAdminContext,
  entry: p.IFileEntry,
  keys: Map<number, Uint8Array>,
  ring: Awaited<ReturnType<typeof currentMaterial>>["ring"],
  names: Map<string, { repoId: string; path: string; keys: Set<string> }>,
) {
  const c = {
    vaultId: context.vaultId,
    epoch: entry.epoch,
    fileId: entry.fileId,
    version: entry.version,
  };

  const name = openedName(entry, keys, ring.idKey, c);
  if (!name) return true;

  const id = text(entry.fileId);
  const found = names.get(id) ?? { ...name, keys: new Set<string>() };
  names.set(id, found);
  if (![1, 3].includes(entry.state)) return false;
  const box = await optionalObject(context.client, `/v1/blobs/${text(entry.blobHash)}`);

  if (!box) {
    return true;
  }

  const content = p.openFile(box, keys.get(entry.epoch)!, ring.idKey, c, entry.blobHash, name);
  const parsed = parseEnv(content.content);

  if (parsed.kind === "parsed")
    for (const assignment of parsed.entries) found.keys.add(assignment.key);
  else return true;

  return false;
}

function openedName(
  entry: p.IFileEntry,
  keys: Map<number, Uint8Array>,
  idKey: Uint8Array,
  c: Parameters<typeof p.openFileName>[3],
) {
  const key = keys.get(entry.epoch);
  if (!key) return undefined;

  try {
    return p.openFileName(entry.name, key, idKey, c);
  } catch {
    return undefined;
  }
}
