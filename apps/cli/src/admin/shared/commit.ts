import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { atomicWrite } from "../../state/store/files.ts";
import { acceptJoin } from "../../vault/join/accept.ts";
import { submitAdmin } from "./submission.ts";
import type { TAdminContext } from "./context.ts";

export async function commitAdmin(context: TAdminContext, swap: p.ISwap) {
  const { history } = await submitAdmin(context, swap);
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
    await atomicWrite(
      join(context.adapters.home, "state", "envelope.bin"),
      swap.envelope,
      context.now,
    );
  }
}
