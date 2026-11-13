import { join } from "node:path";
import { unlink } from "node:fs/promises";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { atomicWrite } from "../../state/store/files.ts";
import { acceptJoin } from "../../vault/join/accept.ts";
import { readHistory } from "../../vault/history.ts";
import type { TAdminContext } from "./context.ts";

export async function commitAdmin(context: TAdminContext, swap: p.ISwap) {
  const pending = join(context.adapters.home, "state", "admin-swap.bin");
  await atomicWrite(pending, p.encode(p.SwapCodec, swap));
  await context.client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
  const history = await readHistory(context.client, context.vaultId);
  const server = context.local.server;
  if (!server) throw new EnvdenError("NOT_FOUND", "Missing server configuration");

  await acceptJoin(
    context.adapters,
    context.client,
    context.identity,
    server.address,
    history.state.serverPin,
    history,
    p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
  );

  if (swap.envelope) {
    await atomicWrite(join(context.adapters.home, "state", "envelope.bin"), swap.envelope);
  }

  await unlink(pending);
}
