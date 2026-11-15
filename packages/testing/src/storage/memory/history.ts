import type { IStorageAdapter } from "@envden/core/adapters";
import { hex } from "./data.ts";
import type { IMemoryContext } from "./data.ts";

export function createHistory(context: IMemoryContext): Pick<IStorageAdapter, "prune"> {
  return {
    prune(vault, policy, now) {
      validatePrune(context, policy);

      const data = context.data;
      const lists = [...data.lists.entries()].filter(([, list]) => list.vault === hex(vault));
      const versions = fileVersions(lists);

      const retained = retainedLists(lists, versions, policy.minVersions);

      const candidates = new Set(
        lists.flatMap(([, list]) =>
          list.files.versions.flatMap((version) =>
            version.blobHash ? [hex(version.blobHash)] : [],
          ),
        ),
      );

      const removedLists = pruneLists(context, lists, retained, vault, policy, now);

      const kept = new Set(
        [...data.lists.values()]
          .filter((list) => list.vault === hex(vault))
          .flatMap((list) =>
            list.files.versions.flatMap((version) =>
              version.blobHash &&
              (list.at >= now - policy.maxAge || isRanked(versions, version, policy.minVersions))
                ? [hex(version.blobHash)]
                : [],
            ),
          ),
      );

      for (const blob of data.blobs.values())
        if (blob.vault === hex(vault) && blob.at < now - 86400000 && !kept.has(hex(blob.hash)))
          candidates.add(hex(blob.hash));

      let blobs = 0;

      for (const hash of candidates)
        if (!kept.has(hash) && data.blobs.delete(`${hex(vault)}:${hash}`)) blobs++;

      return { lists: removedLists, blobs };
    },
  };
}

type TLists = [string, IMemoryContext["data"]["lists"] extends Map<string, infer V> ? V : never][];

function retainedLists(lists: TLists, versions: Map<string, bigint[]>, minVersions: number) {
  const retained = new Map<string, string>();

  for (const [key, list] of lists)
    for (const version of list.files.versions) {
      if (!isRanked(versions, version, minVersions)) continue;

      const versionKey = `${hex(version.fileId)}:${version.version}`;
      const prior = retained.get(versionKey);
      if (!prior || key < prior) retained.set(versionKey, key);
    }

  return retained;
}

function isRanked(
  versions: Map<string, bigint[]>,
  version: { fileId: Uint8Array; version: bigint },
  minVersions: number,
) {
  return (versions.get(hex(version.fileId)) ?? []).slice(0, minVersions).includes(version.version);
}

function fileVersions(lists: TLists) {
  const versions = new Map<string, bigint[]>();

  for (const [, list] of lists)
    for (const version of list.files.versions) {
      const key = hex(version.fileId);
      const values = versions.get(key) ?? [];
      if (!values.includes(version.version)) values.push(version.version);
      values.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
      versions.set(key, values);
    }

  return versions;
}

function validatePrune(context: IMemoryContext, policy: Parameters<IStorageAdapter["prune"]>[1]) {
  if (
    !Number.isFinite(policy.maxAge) ||
    policy.maxAge < 0 ||
    !Number.isInteger(policy.minVersions) ||
    policy.minVersions < 1
  )
    throw new Error("Invalid history policy");

  if (context.depth) throw new Error("Pruning must run outside an application transaction");
}

function pruneLists(
  context: IMemoryContext,
  lists: TLists,
  retained: Map<string, string>,
  vault: Uint8Array,
  policy: Parameters<IStorageAdapter["prune"]>[1],
  now: number,
) {
  const data = context.data;
  let removedLists = 0;

  for (const [key, list] of lists) {
    if (
      list.at < now - policy.maxAge &&
      !list.permanent &&
      data.currentFiles.get(hex(vault)) !== key &&
      ![...retained.values()].includes(key)
    ) {
      data.lists.delete(key);
      removedLists++;
    }
  }

  return removedLists;
}
