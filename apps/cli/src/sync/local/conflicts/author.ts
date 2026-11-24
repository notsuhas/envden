import * as p from "@envden/core/protocol";
import { join } from "node:path";
import type { TSyncContext } from "../../remote/context.ts";
import { text } from "../../../client/encoding.ts";
import { readBytes } from "../files.ts";

type TCheckpoint = TSyncContext["checkpoint"];

// `before` is the checkpoint held before a read-only accept, whose list isn't saved to disk.
export async function entryAuthor(
  context: TSyncContext,
  entry: p.IFileEntry,
  before?: TCheckpoint,
) {
  let signer: Uint8Array | undefined;

  for (const header of [...context.headers].reverse()) {
    const files = await fileList(context, header.body.filesHash, before);
    if (!files) return undefined;
    const found = files.entries.find((item) => p.equal(item.fileId, entry.fileId));
    if (found?.version !== entry.version) break;
    signer = header.body.signer;
  }

  if (!signer || p.equal(signer, context.identity.record.id)) return undefined;

  return context.checkpoint.state.devices.get(p.base32(signer))?.name;
}

async function fileList(context: TSyncContext, hash: Uint8Array, before?: TCheckpoint) {
  for (const checkpoint of [context.checkpoint, before])
    if (checkpoint && p.equal(hash, checkpoint.header.body.filesHash)) return checkpoint.files;

  const saved = await readBytes(join(context.adapters.home, "state", "file-lists", text(hash)));

  try {
    return saved && p.decode(p.FilesCodec, saved);
  } catch {
    return undefined;
  }
}
