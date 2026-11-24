import { join } from "node:path";
import { optionalRead } from "../../../state/store/files.ts";
import { saveClose } from "../resume.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../../adapters.ts";
import type { readHistory } from "../../../vault/history.ts";
import { binary, text } from "../../../client/encoding.ts";
import type { repairContext } from "../upload.ts";
import { adminSwap } from "../../shared/swap.ts";

export async function closeRepair(
  adapters: TAdapters,
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
  status: ReturnType<typeof p.RepairStatusSchema.parse>,
  now: () => number,
) {
  const restoredIndex = history.headers.findIndex((h) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), binary(status.restoredHead)),
  );

  if (restoredIndex < 0) throw new EnvdenError("INVALID_DATA", "Restored head is not on the chain");

  const evidence = await optionalRead(
    join(adapters.home, "state", `repair-restored-${text(context.repairId)}`),
  );

  const evidenceIndex = history.headers.findIndex(
    (h) => evidence === text(p.objectHash(p.ManifestHeaderCodec, h, "manifest")),
  );

  if (evidenceIndex < restoredIndex)
    throw new EnvdenError("INVALID_DATA", "Restored head exceeds the observed restore point");

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 6,
      payload: { repairId: context.repairId, restoredHead: binary(status.restoredHead) },
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "entry",
  );

  const swap = adminSwap(history, context.identity, 12, now(), { entries: [entry] });

  await saveClose(adapters, swap);
  await context.client.request("/v1/swap", "POST", p.SwapCodec.write(swap));
}
