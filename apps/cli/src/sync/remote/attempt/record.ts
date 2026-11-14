import { rm } from "node:fs/promises";
import { requestDeletion } from "../../local/reconciliation/operation/deletion.ts";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../context.ts";
import { atomicWrite, optionalRead } from "../../../state/store/files.ts";
import { binary, text } from "../../../client/encoding.ts";
import { appliedFiles, saveAppliedFiles } from "../../local/applied.ts";
import { saveBase } from "../../local/reconciliation/history.ts";
import { basePath } from "../../local/files.ts";
import { entryContent, entryName } from "../content.ts";
import { storePath } from "../../../store/path.ts";

export async function saveAttempt(
  context: TSyncContext,
  entries: p.IFileEntry[],
  header: TSyncContext["checkpoint"]["header"],
) {
  const hash = text(p.objectHash(p.ManifestHeaderCodec, header, "manifest"));

  const document = JSON.stringify({
    header: hash,
    entries: entries.map((entry) => text(p.FileEntryCodec.write(entry))),
  });

  await atomicWrite(join(context.adapters.home, "state", "attempts", hash), document);
  await atomicWrite(join(context.adapters.home, "state", "upload-attempt.json"), document);
}

export async function acknowledgeAttempt(context: TSyncContext) {
  const saved = await optionalRead(join(context.adapters.home, "state", "upload-attempt.json"));
  if (!saved) return;
  const attempted: { header: string; entries: string[] } = JSON.parse(saved);

  if (
    !context.headers.some(
      (header) =>
        text(p.objectHash(p.ManifestHeaderCodec, header, "manifest")) === attempted.header,
    )
  )
    return;

  const applied = await appliedFiles(context.adapters.home);

  for (const value of attempted.entries) {
    const entry = p.decode(p.FileEntryCodec, binary(value));
    const id = p.base32(entry.fileId);
    const encoded = text(p.FileEntryCodec.write(entry));
    const name = entryName(context, entry);
    const store = storePath(context.adapters.home, name.repoId, name.path);
    const content = await entryContent(context, entry);
    await saveBase(basePath(context.adapters.home, store), content, context.options.now());

    for (const link of context.state.links.filter(
      (link) => link.store === store && link.mode === "copy",
    ))
      await saveBase(
        basePath(context.adapters.home, store, link.root),
        content,
        context.options.now(),
      );

    await atomicWrite(basePath(context.adapters.home, store) + ".entry", encoded);
    applied[id] = encoded;
    await requestDeletion(context.adapters.home, store, false);
  }

  await saveAppliedFiles(context.adapters.home, applied);
  await rm(join(context.adapters.home, "state", "upload-attempt.json"), { force: true });
}
