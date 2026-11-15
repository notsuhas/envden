import * as p from "@envden/core/protocol";
import { sanitizeTerminal } from "../../../../output/sanitize.ts";
import { binary } from "../../../../client/encoding.ts";
import { optionalRead } from "../../../../state/store/files.ts";
import type { TSyncContext } from "../../../remote/context.ts";
import { entryContent } from "../../../remote/content.ts";
import { backup } from "../../conflicts.ts";
import { checkoutPath } from "./display.ts";
import { basePath, readBytes, same } from "../../files.ts";

type TTarget = TSyncContext["state"]["links"][number];

export async function syncedContent(context: TSyncContext, store: string) {
  const encoded = await optionalRead(basePath(context.adapters.home, store) + ".entry");
  if (!encoded) return undefined;

  try {
    return await entryContent(context, p.decode(p.FileEntryCodec, binary(encoded)));
  } catch {
    return undefined;
  }
}

// Bytes equal to the applied server version are already in server history.
export async function keepUnsynced(
  context: Pick<TSyncContext, "adapters" | "options">,
  path: string,
  target: TTarget | undefined,
  synced: Uint8Array | undefined,
) {
  const bytes = await readBytes(path);
  if (bytes === undefined || same(bytes, synced)) return;
  const saved = await backup(context.adapters.home, path, context.options.now());
  if (!saved) return;
  const shown = target ? checkoutPath(context.options.cwd, target.root, target.path) : path;

  context.options.report?.(sanitizeTerminal(`Kept your previous ${shown} at ${saved}`));
}
