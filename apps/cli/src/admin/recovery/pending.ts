import { rm } from "node:fs/promises";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { binary, text } from "../../client/encoding.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { historyHasHeader } from "../../vault/join/validation.ts";
import { acceptAdmin } from "../shared/commit.ts";
import type { TAdminContext } from "../shared/context.ts";
import { currentHistory } from "../shared/history.ts";

function pendingPath(context: TAdminContext) {
  return join(context.adapters.home, "state", "code-replace");
}

export function savePendingCode(context: TAdminContext, swap: p.ISwap) {
  return atomicWrite(pendingPath(context), text(p.SwapCodec.write(swap)), context.now);
}

export function clearPendingCode(context: TAdminContext) {
  return rm(pendingPath(context), { force: true });
}

// Finishes a code swap whose response was lost; an uncommitted one is dropped, so its code never took effect.
export async function settlePendingCode(context: TAdminContext) {
  const saved = await optionalRead(pendingPath(context));
  if (!saved) return false;

  const swap = p.decode(p.SwapCodec, binary(saved));
  const history = await currentHistory(context);
  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");
  const committed = historyHasHeader(history, hash);

  if (committed) await acceptAdmin(context, swap, history);
  await clearPendingCode(context);

  return committed;
}
