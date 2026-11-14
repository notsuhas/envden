import { recoverSyncRecord } from "../../../../state/store/records.ts";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../../../remote/context.ts";
import { optionalRead } from "../../../../state/store/files.ts";
import { binary, text } from "../../../../client/encoding.ts";
import { entryContent } from "../../../remote/content.ts";
import { appliedFiles } from "../../applied.ts";
import { basePath, readBytes, writeBytes } from "../../files.ts";
import { fileSnapshot } from "../snapshot.ts";
import { deletionRequested, readDeletion, requestDeletion } from "./deletion.ts";

type TTarget = TSyncContext["state"]["links"][number];

export async function readFileState(
  context: TSyncContext,
  targets: TTarget[],
  store: string,
  entry: p.IFileEntry | undefined,
) {
  const base = basePath(context.adapters.home, store);

  const ancestor = await recoverSyncRecord(
    base + ".entry",
    base + ".corrupt",
    (saved) => {
      p.decode(p.FileEntryCodec, binary(saved));

      return saved;
    },
    context.options.now(),
    context.options.report,
  );

  await deletionRequested(context.adapters.home, store, context.options.now);
  const corrupt = (await optionalRead(base + ".corrupt")) !== undefined;

  const encoded = corrupt
    ? undefined
    : (ancestor ?? (entry && (await appliedFiles(context.adapters.home))[p.base32(entry.fileId)]));

  const previous = encoded
    ? await entryContent(context, p.decode(p.FileEntryCodec, binary(encoded)))
    : undefined;

  const server = entry ? await entryContent(context, entry) : undefined;

  const reappeared = corrupt ? undefined : await cancelRestoredDeletion(context, targets, store);

  const { stored, restored, deleting } = await restoreStore(
    context,
    store,
    entry,
    corrupt ? undefined : server,
    reappeared?.bytes,
  );

  const snapshots = await Promise.all(
    targets.map((target) => fileSnapshot(context, target, stored, previous)),
  );

  const intent = await readDeletion(context.adapters.home, store, context.options.now);

  const deletionInvalid =
    deleting && entry !== undefined && intent?.entry !== text(p.FileEntryCodec.write(entry));

  return {
    base,
    corrupt,
    encoded,
    previous,
    reappeared: !!reappeared,
    recorded: await readBytes(base),
    server,
    stored,
    snapshots,
    restored,
    deleting,
    deletionInvalid,
  };
}

async function restoreStore(
  context: TSyncContext,
  store: string,
  entry: p.IFileEntry | undefined,
  server: Uint8Array | undefined,
  reappeared: Uint8Array | undefined,
) {
  const before = await readBytes(store);

  if (before === undefined && reappeared !== undefined)
    return { stored: reappeared, restored: false, deleting: false };

  const deleting = await liveDeletion(context, store, entry);

  const restored = before === undefined && server !== undefined && !deleting;

  if (restored) await writeBytes(store, server);
  const stored = restored ? server : before;

  return { stored, restored, deleting };
}

async function cancelRestoredDeletion(context: TSyncContext, targets: TTarget[], store: string) {
  const intent = await readDeletion(context.adapters.home, store, context.options.now);
  if (!intent) return undefined;

  for (const path of [
    store,
    ...targets
      .map((target) => join(target.root, target.path))
      .filter((path) => intent.targets.includes(path)),
  ]) {
    const bytes = await readBytes(path);
    if (bytes === undefined) continue;
    await requestDeletion(context.adapters.home, store, false);
    context.options.report?.(`Cancelled removal; restored env file: ${path}`);

    return { bytes };
  }

  return undefined;
}

async function liveDeletion(context: TSyncContext, store: string, entry: p.IFileEntry | undefined) {
  if (entry?.state === 2 || entry?.state === 4) {
    await requestDeletion(context.adapters.home, store, false);

    return false;
  }

  return deletionRequested(context.adapters.home, store, context.options.now);
}
