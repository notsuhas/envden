import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../../../remote/context.ts";
import { optionalRead } from "../../../../state/store/files.ts";
import { binary, text } from "../../../../client/encoding.ts";
import { entryContent } from "../../../remote/content.ts";
import { appliedFiles } from "../../applied.ts";
import { basePath, readBytes, writeBytes } from "../../files.ts";
import { fileSnapshot } from "../snapshot.ts";
import { deletionRequested, requestDeletion } from "./deletion.ts";

type TTarget = TSyncContext["state"]["links"][number];

export async function readFileState(
  context: TSyncContext,
  targets: TTarget[],
  store: string,
  entry: p.IFileEntry | undefined,
) {
  const base = basePath(context.adapters.home, store);

  const encoded =
    (await optionalRead(base + ".entry")) ??
    (entry && (await appliedFiles(context.adapters.home))[p.base32(entry.fileId)]);

  const previous = encoded
    ? await entryContent(context, p.decode(p.FileEntryCodec, binary(encoded)))
    : undefined;

  const server = entry ? await entryContent(context, entry) : undefined;

  await cancelRestoredDeletion(context, targets, store);
  const { stored, restored, deleting } = await restoreStore(context, store, entry, server);

  const snapshots = await Promise.all(
    targets.map((target) => fileSnapshot(context, target, stored, previous)),
  );

  const intent = await optionalRead(base + ".delete");

  const deletionInvalid =
    deleting && entry !== undefined && intent !== text(p.FileEntryCodec.write(entry));

  return {
    base,
    encoded,
    previous,
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
) {
  const before = await readBytes(store);

  let deleting = await deletionRequested(context.adapters.home, store);

  if (entry?.state === 2 || entry?.state === 4) {
    await requestDeletion(context.adapters.home, store, false);
    deleting = false;
  }

  const restored = before === undefined && server !== undefined && !deleting;

  if (restored) await writeBytes(store, server);
  const stored = restored ? server : before;

  return { stored, restored, deleting };
}

async function cancelRestoredDeletion(context: TSyncContext, targets: TTarget[], store: string) {
  if (!(await deletionRequested(context.adapters.home, store))) return;

  for (const path of [store, ...targets.map((target) => join(target.root, target.path))]) {
    const bytes = await readBytes(path);
    if (bytes === undefined) continue;
    await requestDeletion(context.adapters.home, store, false);
    context.options.report?.(`Cancelled removal; restored env file: ${path}`);

    return;
  }
}
