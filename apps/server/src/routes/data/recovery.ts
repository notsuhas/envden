import { discardMove } from "../../move/discard.ts";
import { finishRepair } from "../../repair/finish.ts";
import { uploadChain } from "../../repair/batch.ts";
import type { Hono, Context } from "hono";
import {
  SwapCodec,
  RepairStatusSchema,
  ObjectsResponseSchema,
  TransferResponseSchema,
  list,
  RepairReportCodec,
  signedCodec,
  decode,
  H,
  base32,
} from "@envden/core/protocol";
import { filterRepairReports } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth, TServerEnv } from "../../http/types.ts";
import { requireRepair } from "../../vault/authorization.ts";
import { vaultChain } from "../../vault/chain.ts";
import { uploadHistory } from "../../repair/upload.ts";
import { openMove, requireMove, freezeMove } from "../../move/session.ts";
import { protocolInput } from "../../http/protocol.ts";
import { commitResponse } from "../../http/result.ts";
import { text } from "../../http/encoding.ts";

function importHistory(options: IAppOptions, auth: IAuth, bytes: Uint8Array, batch: boolean) {
  if (batch)
    return uploadChain(
      options,
      auth,
      protocolInput(() => decode(list(SwapCodec), bytes)),
    );

  return uploadHistory(
    options,
    auth,
    protocolInput(() => decode(SwapCodec, bytes)),
    H("swap", bytes),
  );
}

export function registerRecovery(app: Hono<TServerEnv>, options: IAppOptions) {
  return app
    .post("/v1/move/discard", (c) =>
      c.json(TransferResponseSchema.parse(discardMove(options, c.get("auth")))),
    )
    .post("/v1/move/session", (c) =>
      c.json(TransferResponseSchema.parse(openMove(options, c.get("auth")))),
    )
    .post("/v1/move/freeze", (c) =>
      c.json(TransferResponseSchema.parse(freezeMove(options, c.get("auth"), true))),
    )
    .post("/v1/move/unfreeze", (c) =>
      c.json(TransferResponseSchema.parse(freezeMove(options, c.get("auth"), false))),
    )
    .post("/v1/repair/history", historyHandler(options, requireRepair, false))
    .post("/v1/move/history", historyHandler(options, requireMove, false))
    .post("/v1/repair/chain", historyHandler(options, requireRepair, true))
    .post("/v1/move/chain", historyHandler(options, requireMove, true))
    .post("/v1/repair/finish", async (c) => {
      const raw: unknown = await c.req.json();
      const result = await finishRepair(options, c.get("auth"), raw);

      return c.json(commitResponse(result), result.kind === "head-moved" ? 409 : 200);
    })
    .get("/v1/repair/status", (c) => {
      const auth = c.get("auth");
      requireRepair(options, auth);
      const restored = options.storage.vault(auth.request.vaultId)!.restored!;

      return c.json(
        RepairStatusSchema.parse({
          restoredHead: text(restored.restoredHead),
          repairId: text(restored.finishProgress!),
        }),
      );
    })
    .put("/v1/repair/report", async (c) => {
      const auth = c.get("auth");
      requireRepair(options, auth);
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const report = protocolInput(() => decode(signedCodec(RepairReportCodec), bytes));
      const { storage } = options;
      const vaultId = auth.request.vaultId;

      const reports = filterRepairReports({
        reports: [report],
        repairId: storage.vault(vaultId)!.restored!.finishProgress!,
        state: vaultChain(storage, vaultId).state,
        headerHashes: new Set(
          storage.headers(vaultId, 1n, 0xffffffffffffffffn).map((h) => base32(h.hash)),
        ),
      });

      if (!reports.length || base32(report.body.signer) !== base32(auth.request.device))
        throw new EnvdenError("INVALID_DATA", "Invalid repair report");

      storage.writeState(vaultId, [{ kind: "repair-report", key: report.body.signer, bytes }]);

      return c.json(TransferResponseSchema.parse({ kind: "stored" }));
    })
    .get("/v1/repair/reports", (c) => {
      const auth = c.get("auth");
      requireRepair(options, auth);

      return c.json(
        ObjectsResponseSchema.parse({
          objects: options.storage
            .states(auth.request.vaultId, "repair-report")
            .map((r) => text(r.bytes)),
        }),
      );
    });
}

function historyHandler(options: IAppOptions, authorize: typeof requireMove, batch: boolean) {
  return async (c: Context<TServerEnv>) => {
    const auth = c.get("auth");
    authorize(options, auth);

    return c.json(
      commitResponse(
        importHistory(options, auth, new Uint8Array(await c.req.arrayBuffer()), batch),
      ),
    );
  };
}
