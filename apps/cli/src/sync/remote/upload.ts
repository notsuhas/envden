import { sealUpload } from "./seal.ts";
import * as p from "@envden/core/protocol";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { TSyncContext } from "./context.ts";
import { readBytes, basePath, same, writeBytes } from "../local/files.ts";
import { entryContent } from "./content.ts";
import { backup } from "../local/conflicts.ts";

import type { ILocalState } from "../../state/model.ts";

export async function uploadLink(
  context: TSyncContext,
  repos: Set<string>,
  link: ILocalState["links"][number],
  files: p.IFiles,
  changed: Map<string, { base: string; bytes: Uint8Array | undefined }>,
  seen: Map<string, Uint8Array | undefined>,
) {
  const approved = context.state.approved.find((item) => item.root === link.root);
  if (link.localOnly || !approved) return;
  const repoId = context.state.aliases[approved.repoId] ?? approved.repoId;
  if (!repos.has(repoId)) return;
  const fileId = p.fileId(context.checkpoint.idKey, repoId, link.path);
  const id = p.base32(fileId);

  const base = basePath(
    context.adapters.home,
    link.store,
    link.mode === "copy" ? link.root : undefined,
  );

  const status = await context.adapters
    .placement(link.mode, link.root)
    .inspect(link.store, join(link.root, link.path));

  if (status === "detached")
    throw new EnvdenError("CONFLICT", "Detached checkout; resolve local content before pushing");

  const bytes =
    status === "missing"
      ? undefined
      : await readBytes(link.mode === "link" ? link.store : join(link.root, link.path));

  const previous = context.checkpoint.files.entries.find((item) => p.equal(item.fileId, fileId));

  const baseline = await uploadBaseline(context, base, previous);

  if (same(bytes, baseline)) return;

  if (seen.has(id) && !same(seen.get(id), bytes))
    throw new EnvdenError("CONFLICT", "Copies of one file differ; sync them separately");

  seen.set(id, bytes);
  const next = await sealUpload(context, repoId, link.path, fileId, previous, bytes);

  const index = files.entries.findIndex((item) => p.equal(item.fileId, fileId));

  if (index < 0) files.entries.push(next);
  else files.entries[index] = next;

  changed.set(base, { base, bytes });

  await updateCopyStore(context, link, bytes);
}

async function updateCopyStore(
  context: TSyncContext,
  link: ILocalState["links"][number],
  bytes: Uint8Array | undefined,
) {
  if (link.mode === "copy" && !same(await readBytes(link.store), bytes)) {
    await backup(context.adapters.home, link.store, context.options.now());
    await writeBytes(link.store, bytes);
  }
}

async function uploadBaseline(
  context: TSyncContext,
  base: string,
  previous: p.IFileEntry | undefined,
) {
  const baseline =
    (await readBytes(base)) ?? (previous ? await entryContent(context, previous) : undefined);

  return baseline;
}
