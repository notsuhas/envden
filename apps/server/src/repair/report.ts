import {
  RepairReportCodec,
  signedCodec,
  decode,
  base32,
  TransferResponseSchema,
} from "@envden/core/protocol";
import { filterRepairReports } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { requireRepair } from "../vault/authorization.ts";
import { vaultChain } from "../vault/chain.ts";
import { protocolInput } from "../http/protocol.ts";

export function storeReport(options: IAppOptions, auth: IAuth, bytes: Uint8Array) {
  requireRepair(options, auth);
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

  return TransferResponseSchema.parse({ kind: "stored" });
}
