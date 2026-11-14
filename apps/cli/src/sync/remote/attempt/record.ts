import { rm } from "node:fs/promises";
import { requestDeletion } from "../../local/reconciliation/operation/deletion.ts";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../context.ts";
import { atomicWrite, optionalRead } from "../../../state/store/files.ts";
import { text } from "../../../client/encoding.ts";
import { appliedFiles, saveAppliedFiles } from "../../local/applied.ts";
import { saveBase } from "../../local/reconciliation/history.ts";
import { basePath } from "../../local/files.ts";
import { entryContent, entryName } from "../content.ts";
import { storePath } from "../../../store/path.ts";

export async function saveAttempt(context: TSyncContext, entries: p.IFileEntry[]) {
  await atomicWrite(
    join(context.adapters.home, "state", "upload-attempt.json"),
    JSON.stringify(
      Object.fromEntries(
        entries.map((entry) => [p.base32(entry.fileId), text(p.FileEntryCodec.write(entry))]),
      ),
    ),
  );
}

export async function acknowledgeAttempt(context: TSyncContext) {
  const saved = await optionalRead(join(context.adapters.home, "state", "upload-attempt.json"));
  if (!saved) return;
  const attempted: Record<string, string> = JSON.parse(saved);
  const applied = await appliedFiles(context.adapters.home);

  for (const entry of context.checkpoint.files.entries) {
    const id = p.base32(entry.fileId);
    const encoded = text(p.FileEntryCodec.write(entry));
    if (attempted[id] !== encoded) continue;
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

    applied[id] = encoded;
    await requestDeletion(context.adapters.home, store, false);
  }

  await saveAppliedFiles(context.adapters.home, applied);
  await rm(join(context.adapters.home, "state", "upload-attempt.json"), { force: true });
}
