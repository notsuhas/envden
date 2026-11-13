import { uploadLink } from "./upload.ts";
import { appliedFiles, saveAppliedFiles } from "../local/applied.ts";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "./context.ts";
import { text } from "../../client/encoding.ts";
import { writeBytes } from "../local/files.ts";

export async function uploadChanges(context: TSyncContext, repos: Set<string>) {
  const files: p.IFiles = { entries: [...context.checkpoint.files.entries] };
  const changed = new Map<string, { base: string; bytes: Uint8Array | undefined }>();
  const seen = new Map<string, Uint8Array | undefined>();

  for (const link of context.state.links)
    await uploadLink(context, repos, link, files, changed, seen);

  if (!changed.size) return 0;
  files.entries.sort((a, b) => p.compare(a.fileId, b.fileId));
  const previous = context.checkpoint.header;
  const expectedHead = p.objectHash(p.ManifestHeaderCodec, previous, "manifest");

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      ...previous.body,
      seq: previous.body.seq + 1n,
      prev: expectedHead,
      signer: context.identity.record.id,
      op: 1,
      filesHash: p.H("files", p.FilesCodec.write(files)),
      createdAt: BigInt(context.options.now()),
    },
    context.identity.keys.objSk,
    "manifest",
  );

  const swap: p.ISwap = {
    expectedHead,
    header,
    files,
    entries: [],
    keyring: undefined,
    envelope: undefined,
    skPub: undefined,
    opaqueRecord: undefined,
    approver: undefined,
  };

  await context.client.rpc.v1.swap.$post(
    {},
    { init: { body: new Uint8Array(p.SwapCodec.write(swap)) } },
  );

  context.checkpoint = { ...context.checkpoint, header, files };
  context.headers.push(header);
  const applied = await appliedFiles(context.adapters.home);

  for (const entry of files.entries) {
    if (seen.has(p.base32(entry.fileId)))
      applied[p.base32(entry.fileId)] = text(p.FileEntryCodec.write(entry));
  }

  await saveAppliedFiles(context.adapters.home, applied);
  for (const item of changed.values()) await writeBytes(item.base, item.bytes);

  return changed.size;
}
