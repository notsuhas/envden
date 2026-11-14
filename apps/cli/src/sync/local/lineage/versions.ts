import * as p from "@envden/core/protocol";
import { join } from "node:path";
import type { TSyncContext } from "../../remote/context.ts";
import { text } from "../../../client/encoding.ts";
import { atomicWrite, optionalRead } from "../../../state/store/files.ts";

export function derivePlaceVersion(
  current: string | null,
  recorded: string | null,
  ancestor: boolean,
) {
  if (current !== recorded) return "edited";

  return ancestor ? "unchanged" : "unaccepted";
}

export async function rememberVersion(context: TSyncContext, entry: p.IFileEntry) {
  const current = context.checkpoint.files.entries.find((item) =>
    p.equal(item.fileId, entry.fileId),
  );

  const encoded = text(p.FileEntryCodec.write(entry));
  if (!current || text(p.FileEntryCodec.write(current)) !== encoded) return;
  const header = text(p.objectHash(p.ManifestHeaderCodec, context.checkpoint.header, "manifest"));
  const path = join(context.adapters.home, "state", "lineage", p.base32(entry.fileId), header);
  if ((await optionalRead(path)) === encoded) return;
  await atomicWrite(path, encoded);
}
