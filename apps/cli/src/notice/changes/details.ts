import { z } from "zod";
import { basename, join } from "node:path";
import { diffEnvKeys } from "@envden/core/merge";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../../sync/remote/context.ts";
import type { ILocalState } from "../../state/model.ts";
import { entryContent } from "../../sync/remote/content.ts";
import { entryAuthor } from "../../sync/local/conflicts/author.ts";
import { binary } from "../../client/encoding.ts";
import { SHOWN_KEYS } from "../../output/key-list.ts";

// Names and counts only; the notice cache never holds values.
export const changedFileSchema = z.object({
  repoId: z.string(),
  path: z.string(),
  label: z.string(),
  device: z.string().exactOptional(),
  keys: z.array(z.string()).max(SHOWN_KEYS),
  count: z.number().int().nonnegative().exactOptional(),
});

export type TChangedFile = z.infer<typeof changedFileSchema>;

export async function changedFile(
  context: TSyncContext,
  entry: p.IFileEntry,
  name: { repoId: string; path: string },
  applied: string | undefined,
  known?: ReadonlyMap<string, p.IFiles>,
): Promise<TChangedFile> {
  const device = await entryAuthor(context, entry, known).catch(() => undefined);

  return {
    repoId: name.repoId,
    path: name.path,
    label: fileLabel(context.state, name),
    ...(device ? { device } : {}),
    ...(await changedKeys(context, entry, applied)),
  };
}

export function fileLabel(state: ILocalState, name: { repoId: string; path: string }) {
  const checkout = state.approved.find(
    (item) => (state.aliases[item.repoId] ?? item.repoId) === name.repoId,
  );

  return checkout ? join(basename(checkout.root), name.path) : name.path;
}

async function changedKeys(context: TSyncContext, entry: p.IFileEntry, applied?: string) {
  try {
    const before = applied
      ? await entryContent(context, p.decode(p.FileEntryCodec, binary(applied)))
      : undefined;

    const after = await entryContent(context, entry);
    const diff = diffEnvKeys(before ?? new Uint8Array(), after ?? new Uint8Array());
    if (diff.kind !== "diff") return { keys: [] };
    const names = [...diff.changed, ...diff.added, ...diff.removed];

    return { keys: names.slice(0, SHOWN_KEYS), count: names.length };
  } catch {
    // The line falls back to naming the file when its blob or base can't be read.
    return { keys: [] };
  }
}
