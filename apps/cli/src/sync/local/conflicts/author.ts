import * as p from "@envden/core/protocol";
import { join } from "node:path";
import type { TSyncContext } from "../../remote/context.ts";
import { text } from "../../../client/encoding.ts";
import { readBytes } from "../files.ts";

export async function entryAuthor(context: TSyncContext, entry: p.IFileEntry) {
  let signer: Uint8Array | undefined;

  for (const header of [...context.headers].reverse()) {
    const files = await fileList(context, header.body.filesHash);
    if (!files) return undefined;
    const found = files.entries.find((item) => p.equal(item.fileId, entry.fileId));
    if (found?.version !== entry.version) break;
    signer = header.body.signer;
  }

  if (!signer || p.equal(signer, context.identity.record.id)) return undefined;

  return context.checkpoint.state.devices.get(p.base32(signer))?.name;
}

async function fileList(context: TSyncContext, hash: Uint8Array) {
  if (p.equal(hash, context.checkpoint.header.body.filesHash)) return context.checkpoint.files;
  const saved = await readBytes(join(context.adapters.home, "state", "file-lists", text(hash)));

  try {
    return saved && p.decode(p.FilesCodec, saved);
  } catch {
    return undefined;
  }
}
