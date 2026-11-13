import { prepareCommit, writeCommitState } from "@envden/core/adapters";
import type { IStorageAdapter, IStoredSwap } from "@envden/core/adapters";
import { equal, hex } from "./data.ts";
import type { IMemoryContext } from "./data.ts";

export function createCommit(
  context: IMemoryContext,
  storage: IStorageAdapter,
): IStorageAdapter["commitSwap"] {
  return (vault, expected, swap, now) =>
    storage.transaction(() => {
      const key = hex(vault);
      const data = context.data;
      const digest = `${key}:${hex(swap.bodyDigest)}`;
      if (data.digests.has(digest)) return { kind: "retry-of-committed" };
      const head = storage.head(vault);
      if (!equal(head, expected)) return { kind: "head-moved", ...(head ? { head } : {}) };

      prepareCommit(storage, vault, swap, now);
      const headers = checkedHeaders(context, key, swap);

      writeFiles(context, key, swap, now);

      const current = data.currentFiles.get(key);
      const list = current ? data.lists.get(current) : undefined;
      if (list) list.at = now;
      headers.push(structuredClone(swap.header));
      data.headers.set(key, headers);
      appendEntries(context, key, swap);

      writeCommitState(storage, vault, swap);

      writeApprover(context, key, swap, now);

      if (swap.closeMailbox !== undefined) storage.closeMailbox(vault, swap.closeMailbox);
      if (swap.setupTokenHash) data.setup.delete("token");
      data.digests.add(digest);
      data.heads.set(key, swap.header.hash.slice());

      return { kind: "committed" };
    });
}

function writeFiles(context: IMemoryContext, key: string, swap: IStoredSwap, now: number) {
  const data = context.data;

  if (swap.files) {
    const listKey = `${key}:${hex(swap.files.hash)}`;
    const prior = data.lists.get(listKey);

    data.lists.set(listKey, {
      vault: key,
      files: structuredClone(swap.files),
      at: now,
      permanent: (prior?.permanent ?? false) || (swap.files.retainForever ?? false),
    });

    if (swap.files.retainForever) {
      const current = data.currentFiles.get(key);
      const previous = current ? data.lists.get(current) : undefined;
      if (previous) previous.permanent = true;
    }

    data.currentFiles.set(key, listKey);
  }
}

function writeApprover(context: IMemoryContext, key: string, swap: IStoredSwap, now: number) {
  const data = context.data;

  if (swap.approver)
    data.approvers.set(`${key}:${hex(swap.approver.device)}`, {
      bytes: swap.approver.bytes.slice(),
      expires: now + 86400000,
    });

  if (swap.clearRepairReports)
    for (const [stateKey, state] of data.states)
      if (state.vault === key && state.kind === "repair-report") data.states.delete(stateKey);
}

function checkedHeaders(context: IMemoryContext, key: string, swap: IStoredSwap) {
  const data = context.data;
  const headers = data.headers.get(key) ?? [];

  if (
    headers.some((header) => header.seq === swap.header.seq || equal(header.hash, swap.header.hash))
  )
    throw new Error("Duplicate header");

  if (swap.header.seq < 0n || swap.header.seq > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Invalid sequence");

  return headers;
}

function appendEntries(context: IMemoryContext, key: string, swap: IStoredSwap) {
  const data = context.data;
  const entries = data.entries.get(key) ?? [];

  for (const entry of swap.entries) {
    if (entries.some((prior) => prior.seq === entry.seq || equal(prior.hash, entry.hash)))
      throw new Error("Duplicate entry");

    entries.push(structuredClone(entry));
  }

  data.entries.set(key, entries);
}
