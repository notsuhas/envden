import { inspectExposedFile } from "./exposed-file.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdminContext } from "../shared/context.ts";
import type { THistory } from "../../vault/history.ts";
import { text } from "../../client/encoding.ts";
import { currentMaterial } from "../shared/material.ts";
import { optionalObject } from "../shared/transfer.ts";

export async function exposedNames(context: TAdminContext, history: THistory) {
  const { ring, keys } = await currentMaterial(context, history);

  const names = new Map<string, { repoId: string; path: string; keys: Set<string> }>();
  let incomplete = false;

  const lists = new Set<string>();
  const blobs = new Set<string>();

  for (const header of history.headers) {
    const hash = text(header.body.filesHash);
    if (lists.has(hash)) continue;
    lists.add(hash);
    const bytes = await optionalObject(context.client, `/v1/files/${text(header.body.filesHash)}`);

    if (!bytes) {
      incomplete = true;
      continue;
    }

    if (!p.equal(p.H("files", bytes), header.body.filesHash))
      throw new EnvdenError("INVALID_DATA", "File list hash mismatch");

    for (const entry of p.decode(p.FilesCodec, bytes).entries) {
      const blob = text(entry.blobHash);
      if (blobs.has(blob)) continue;
      blobs.add(blob);
      if (await inspectExposedFile(context, entry, keys, ring, names)) incomplete = true;
    }
  }

  return {
    files: [...names.values()].map((name) => ({
      repoId: name.repoId,
      path: name.path,
      keys: [...name.keys].sort(),
    })),
    incomplete,
  };
}
