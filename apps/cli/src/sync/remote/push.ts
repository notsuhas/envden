import { acknowledgeAttempt, saveAttempt } from "./attempt/record.ts";
import { reportBlocked } from "./attempt/notices.ts";
import { blockedStores } from "./attempt/blocked.ts";
import { uploadLink } from "./upload.ts";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "./context.ts";
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
  await reportBlocked(context);

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
    proofPub: undefined,
    approver: undefined,
  };

  await saveAttempt(
    context,
    files.entries.filter((entry) => seen.has(p.base32(entry.fileId))),
    header,
    [
      ...new Set([
        ...changed.keys(),
        ...context.state.links
          .filter((link) =>
            changed.has(
              basePath(
                context.adapters.home,
                link.store,
                link.mode === "copy" ? link.root : undefined,
              ),
            ),
          )
          .map((link) => basePath(context.adapters.home, link.store)),
      ]),
    ],
  );

  await context.client.rpc.v1.swap.$post(
    {},
    { init: { body: new Uint8Array(p.SwapCodec.write(swap)) } },
  );

  context.checkpoint = { ...context.checkpoint, header, files };
  context.headers.push(header);
  await acknowledgeAttempt(context);

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
