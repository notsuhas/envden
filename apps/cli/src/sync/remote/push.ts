import { atomicWrite } from "../../state/store/files.ts";
import { entryName } from "./content.ts";
import { storePath } from "../../store/path.ts";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { requestDeletion } from "../local/reconciliation/operation/deletion.ts";
import { saveBase } from "../local/reconciliation/history.ts";
import { saveAttempt } from "./attempt/record.ts";
import { reportBlocked } from "./attempt/notices.ts";
import { blockedStores } from "./attempt/blocked.ts";
import { uploadLink } from "./upload.ts";
import { appliedFiles, saveAppliedFiles } from "../local/applied.ts";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "./context.ts";
import { text } from "../../client/encoding.ts";
import { basePath } from "../local/files.ts";

export async function uploadChanges(
  context: TSyncContext,
  repos: Set<string>,
  failedStores: ReadonlySet<string>,
) {
  const files: p.IFiles = { entries: [...context.checkpoint.files.entries] };
  const changed = new Map<string, { base: string; bytes: Uint8Array | undefined }>();
  const seen = new Map<string, Uint8Array | undefined>();

  const blocked = await blockedStores(context, failedStores);
  await reportBlocked(context, blocked);

  for (const link of context.state.links) {
    if (!blocked.has(link.store)) await uploadLink(context, repos, link, files, changed, seen);
  }

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

  await saveAttempt(
    context,
    files.entries.filter((entry) => seen.has(p.base32(entry.fileId))),
    header,
  );

  await context.client.rpc.v1.swap.$post(
    {},
    { init: { body: new Uint8Array(p.SwapCodec.write(swap)) } },
  );

  context.checkpoint = { ...context.checkpoint, header, files };
  context.headers.push(header);
  const applied = await appliedFiles(context.adapters.home);

  for (const entry of files.entries) {
    if (seen.has(p.base32(entry.fileId))) {
      const encoded = text(p.FileEntryCodec.write(entry));
      applied[p.base32(entry.fileId)] = encoded;
      const name = entryName(context, entry);

      await atomicWrite(
        basePath(context.adapters.home, storePath(context.adapters.home, name.repoId, name.path)) +
          ".entry",
        encoded,
      );
    }
  }

  for (const item of changed.values()) await saveBase(item.base, item.bytes, context.options.now());
  await saveAppliedFiles(context.adapters.home, applied);
  await rm(join(context.adapters.home, "state", "upload-attempt.json"), { force: true });

  for (const link of context.state.links) {
    if (
      seen.size &&
      changed.has(
        basePath(context.adapters.home, link.store, link.mode === "copy" ? link.root : undefined),
      )
    )
      await requestDeletion(context.adapters.home, link.store, false);
  }

  context.state.links = context.state.links.filter(
    (link) =>
      link.localOnly ||
      !changed.has(
        basePath(context.adapters.home, link.store, link.mode === "copy" ? link.root : undefined),
      ) ||
      changed.get(
        basePath(context.adapters.home, link.store, link.mode === "copy" ? link.root : undefined),
      )!.bytes !== undefined,
  );

  return changed.size;
}
