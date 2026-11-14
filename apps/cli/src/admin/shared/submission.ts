import { historyHasHeader } from "../../vault/join/validation.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { readHistory } from "../../vault/history.ts";
import type { TAdminContext } from "./context.ts";

export async function submitAdmin(context: TAdminContext, swap: p.ISwap) {
  await context.client.request("/v1/swap", "POST", p.SwapCodec.write(swap));
  const history = await readHistory(context.client, context.vaultId);
  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");

  if (!historyHasHeader(history, hash))
    throw new EnvdenError("INVALID_DATA", "Server did not commit the requested swap");

  return { history, swap };
}
