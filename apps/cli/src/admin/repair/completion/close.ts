import { saveClose } from "../resume.ts";
import * as p from "@envden/core/protocol";
import { repairLoginDecision } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../../adapters.ts";
import type { readHistory } from "../../../vault/history.ts";
import { binary, text } from "../../../client/encoding.ts";
import { repairLogin } from "../login.ts";
import type { repairContext } from "../upload.ts";
import { adminSwap } from "../../shared/swap.ts";

export async function closeRepair(
  adapters: TAdapters,
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
  status: ReturnType<typeof p.RepairStatusSchema.parse>,
  options: { password: string; now: () => number },
) {
  const restoredIndex = history.headers.findIndex((h) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, h, "manifest"), binary(status.restoredHead)),
  );

  if (restoredIndex < 0) throw new EnvdenError("INVALID_DATA", "Restored head is not on the chain");
  const after = history.headers.slice(restoredIndex + 1).map((h) => h.body);

  const finish = await repairLogin(
    context.client,
    context.vaultId,
    options.password,
    repairLoginDecision(after),
  );

  const record = finish.kind === "registration" ? binary(finish.message) : undefined;

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

  const swap = adminSwap(history, context.identity, 12, options.now(), {
    entries: [entry],
    ...(record ? { opaqueRecord: record } : {}),
  });

  await saveClose(adapters, swap);

  await context.client.request("/v1/repair/finish", "POST", {
    ...finish,
    swap: text(p.SwapCodec.write(swap)),
  });
}
