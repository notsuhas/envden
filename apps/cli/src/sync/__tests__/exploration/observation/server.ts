import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../../../remote/context.ts";
import { acceptHead } from "../../../remote/accept.ts";
import { persistCheckpoint } from "../../../remote/persist.ts";
import { entryContent } from "../../../remote/content.ts";

export async function serverBytes(context: TSyncContext, repoId: string) {
  const before = context.checkpoint.header;
  await acceptHead(context);
  if (context.checkpoint.header !== before) await persistCheckpoint(context);
  const id = p.fileId(context.checkpoint.idKey, repoId, ".env");
  const entry = context.checkpoint.files.entries.find((item) => p.equal(item.fileId, id));
  const bytes = entry ? await entryContent(context, entry) : undefined;

  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}
