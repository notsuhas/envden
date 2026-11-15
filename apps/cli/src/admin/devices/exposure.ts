import { inspectExposedFile } from "./exposed-file.ts";
import type { TAdminContext } from "../shared/context.ts";
import type { THistory } from "../../vault/history.ts";
import { text } from "../../client/encoding.ts";
import { currentMaterial } from "../shared/material.ts";
import { retainedList } from "../../vault/files/retained.ts";

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
    const files = await retainedList(context.client, header.body.filesHash);

    if (!files) {
      incomplete = true;
      continue;
    }

    for (const entry of files.entries) {
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
