import { rm } from "node:fs/promises";

import { adoptRejoin, finishRejoinIdentity } from "../../admin/rejoin/classify.ts";

import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";

import { acceptJoin } from "../join/accept.ts";

import type { prepareRecoveryJoin, IRecoveryJoin } from "./attempt.ts";

export async function resumeRecoveryJoin(
  adapters: TAdapters,
  options: IRecoveryJoin,
  context: Awaited<ReturnType<typeof prepareRecoveryJoin>>,
) {
  const { resuming, history, identity, client, server, pending } = context;
  if (!resuming || !history.state.devices.has(p.base32(identity.record.id))) return;

  {
    const own = history.headers.find(
      (h) => h.body.op === 3 && p.equal(h.body.signer, identity.record.id),
    );

    if (!own) throw new EnvdenError("INVALID_DATA", "Missing recovery join checkpoint");
    if (options.rejoin) await adoptRejoin(adapters, history);

    const accepted = await acceptJoin(
      adapters,
      client,
      identity,
      options.address,
      server.pin,
      history,
      p.objectHash(p.ManifestHeaderCodec, own, "manifest"),
    );

    if (options.rejoin) await finishRejoinIdentity(adapters);
    await rm(pending, { force: true });

    return accepted;
  }
}
