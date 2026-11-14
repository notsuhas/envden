import { hasAppliedEntry } from "../local/applied.ts";
import { fileSizeNotice } from "../local/validation/size.ts";
import { sealUpload } from "./seal.ts";
import * as p from "@envden/core/protocol";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { TSyncContext } from "./context.ts";
import { readBytes, basePath, same } from "../local/files.ts";
import { entryContent } from "./content.ts";

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
  if (link.localOnly || !approved || context.skippedRoots.has(link.root)) return;
  const repoId = context.state.aliases[approved.repoId] ?? approved.repoId;
  if (!repos.has(repoId)) return;
  const fileId = p.fileId(context.checkpoint.idKey, repoId, link.path);
  const id = p.base32(fileId);

  const base = basePath(
    context.adapters.home,
    link.store,
    link.mode === "copy" ? link.root : undefined,
  );

  const bytes = await uploadBytes(context, link);

  const notice = fileSizeNotice(link.path, bytes);

  if (notice) {
    context.options.report?.(notice);

    return;
  }

  const previous = context.checkpoint.files.entries.find((item) => p.equal(item.fileId, fileId));

  if (
    previous &&
    (previous.state === 2 || previous.state === 4) &&
    bytes !== undefined &&
    (await readBytes(base)) === undefined &&
    !(await hasAppliedEntry(context.adapters.home, previous))
  )
    throw new EnvdenError("CONFLICT", "Deleted file has no agreed base; resolve before pushing");

  const baseline = await uploadBaseline(context, previous);

  if (same(bytes, baseline)) return;

  if (seen.has(id)) {
    changed.set(base, { base, bytes });

    return;
  }

  seen.set(id, bytes);
  const next = await sealUpload(context, repoId, link.path, fileId, previous, bytes);

  const index = files.entries.findIndex((item) => p.equal(item.fileId, fileId));

  if (index < 0) files.entries.push(next);
  else files.entries[index] = next;

  changed.set(base, { base, bytes });
}

async function uploadBaseline(context: TSyncContext, previous: p.IFileEntry | undefined) {
  if (!previous) return undefined;

  const baseline = await entryContent(context, previous);

  return baseline;
}

async function uploadBytes(context: TSyncContext, link: ILocalState["links"][number]) {
  const status = await context.adapters
    .placement(link.mode, link.root)
    .inspect(link.store, join(link.root, link.path));

  if (status === "detached" && link.mode === "link")
    throw new EnvdenError("CONFLICT", "Detached checkout; resolve local content before pushing");

  return readBytes(link.store);
}
