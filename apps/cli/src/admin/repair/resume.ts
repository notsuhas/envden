import { historyHasHeader } from "../../vault/join/validation.ts";
import { rm } from "node:fs/promises";
import { optionalObject } from "../shared/transfer.ts";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { atomicWrite, optionalRead } from "../../state/store/files.ts";
import { binary, text } from "../../client/encoding.ts";
import { adminContext } from "../shared/context.ts";
import { readHistory } from "../../vault/history.ts";
import { acceptJoin } from "../../vault/join/accept.ts";
import { refuseSecretKeyProof } from "@envden/core/chain";

export async function saveClose(adapters: TAdapters, swap: p.ISwap) {
  await atomicWrite(join(adapters.home, "state", "repair-close"), text(p.SwapCodec.write(swap)));
}

export async function resumeClose(
  adapters: TAdapters,
  token: string,
  now: () => number,
  fetcher: TFetch,
) {
  const saved = await optionalRead(join(adapters.home, "state", "repair-close"));
  if (!saved) return;
  const swap = p.decode(p.SwapCodec, binary(saved));
  const close = swap.entries[0]?.body;
  const repairId = p.H("repair-id", p.decodeToken("repair", token).secret);

  if (close?.kind !== 6 || !p.equal(close.payload.repairId, repairId)) {
    await rm(join(adapters.home, "state", "repair-close"), { force: true });

    return;
  }

  const context = await adminContext(adapters, now, fetcher);
  let history;

  try {
    history = await readHistory(context.client, context.vaultId);
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "RESTORED_MODE") return;
    throw error;
  }

  const hash = p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest");

  if (!historyHasHeader(history, hash)) {
    await rm(join(adapters.home, "state", "repair-close"), { force: true });
    throw new EnvdenError("FORK", "Repair close is not on the server chain");
  }

  await acceptJoin(
    adapters,
    context.client,
    context.identity,
    context.local.server!.address,
    history.state.serverPin,
    history,
    p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
  );

  const envelope = await optionalObject(context.client, "/v1/envelope");

  const restoredIndex = history.headers.findIndex((h) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), close.payload.restoredHead),
  );

  if (restoredIndex < 0) throw new EnvdenError("INVALID_DATA", "Missing restored checkpoint");

  const result = {
    kind: "finished" as const,
    report: await optionalRead(join(adapters.home, "state", `repair-report-${text(repairId)}`)),
    replaceKit: refuseSecretKeyProof(
      history.headers
        .slice(restoredIndex + 1)
        .filter((h) => h.body.seq < swap.header.body.seq)
        .map((h) => h.body),
      !!envelope && p.equal(p.H("envelope-blob", envelope), swap.header.body.envelopeHash),
    ),
  };

  await rm(join(adapters.home, "state", "repair-close"), { force: true });

  return result;
}
