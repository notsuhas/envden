import { atomicWrite } from "../../state/store/files.ts";
import * as p from "@envden/core/protocol";
import { join } from "node:path";
import type { TSyncContext } from "./context.ts";
import { text } from "../../client/encoding.ts";

export async function sealUpload(
  context: TSyncContext,
  repoId: string,
  path: string,
  fileId: Uint8Array,
  previous: p.IFileEntry | undefined,
  bytes: Uint8Array | undefined,
) {
  const epoch = context.checkpoint.header.body.epoch;
  const key = context.keys.get(epoch)!;
  const version = (previous?.version ?? 0n) + 1n;
  const name = { repoId, path: path };
  const c = { vaultId: context.vaultId, epoch, version, fileId };
  let blobHash: Uint8Array = new Uint8Array(32);

  if (bytes !== undefined) {
    const blob = p.sealFile({ ...name, content: bytes }, key, c);
    blobHash = p.H("blob", blob);

    await context.client.rpc.v1.blobs[":hash"].$put(
      { param: { hash: text(blobHash) } },
      { init: { body: new Uint8Array(blob) } },
    );

    await atomicWrite(
      join(context.adapters.home, "state", "blobs", text(blobHash)),
      blob,
      context.options.now,
    );
  }

  const next: p.IFileEntry = {
    fileId,
    epoch,
    version,
    state: bytes === undefined ? 2 : 1,
    blobHash,
    name: p.sealFileName(name, key, c),
  };

  return next;
}
