import * as p from "@envden/core/protocol";
import { filterRepairReports } from "@envden/core/chain";
import { binary } from "../../../client/encoding.ts";
import type { repairContext } from "../upload.ts";

import type { THistory } from "../../../vault/history.ts";

export async function repairReports(
  context: Awaited<ReturnType<typeof repairContext>>,
  history: THistory,
) {
  const encoded = p.ObjectsResponseSchema.parse(
    await (await context.client.request("/v1/repair/reports")).json(),
  ).objects;

  const reports = filterRepairReports({
    reports: encoded.map((r) => p.decode(p.signedCodec(p.RepairReportCodec), binary(r))),
    repairId: context.repairId,
    state: history.state,
    headerHashes: new Set(
      history.headers.map((h) => p.base32(p.objectHash(p.ManifestHeaderCodec, h, "manifest"))),
    ),
  });

  return reports;
}
