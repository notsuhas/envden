import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { join } from "node:path";
import type { TSyncContext } from "./context.ts";
import { text } from "../../client/encoding.ts";
import { readBytes } from "../local/files.ts";
import { atomicWrite } from "../../state/store/files.ts";

export function entryName(context: TSyncContext, entry: p.IFileEntry) {
  const key = context.keys.get(entry.epoch);
  if (!key) throw new EnvdenError("LOCKED", "Epoch key unavailable");

  return p.openFileName(entry.name, key, context.checkpoint.idKey, {
    ...entry,
    vaultId: context.vaultId,
  });
}

export function readableEntries(context: TSyncContext) {
  return context.checkpoint.files.entries.filter((entry) => {
    try {
      entryName(context, entry);

      return true;
    } catch (error) {
      // A member can publish an entry whose name doesn't open; skip it rather than block sync.
      if (error instanceof EnvdenError && error.code === "LOCKED") throw error;

      return false;
    }
  });
}

export async function entryContent(
  context: TSyncContext,
  entry: p.IFileEntry,
): Promise<Uint8Array | undefined> {
  if (entry.state === 2 || entry.state === 4) return undefined;
  const name = entryName(context, entry);

  const cached = await readBytes(
    join(context.adapters.home, "state", "blobs", text(entry.blobHash)),
  );

  const box =
    cached ??
    new Uint8Array(
      await (
        await context.client.rpc.v1.blobs[":hash"].$get({ param: { hash: text(entry.blobHash) } })
      ).arrayBuffer(),
    );

  const value = p.openFile(
    box,
    context.keys.get(entry.epoch)!,
    context.checkpoint.idKey,
    { ...entry, vaultId: context.vaultId },
    entry.blobHash,
    name,
  );

  if (!cached)
    await atomicWrite(
      join(context.adapters.home, "state", "blobs", text(entry.blobHash)),
      box,
      context.options.now,
    );

  return value.content;
}
