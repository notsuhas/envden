import { VERSION } from "../../../version.ts";
import { EnvdenError } from "@envden/core/errors";
import * as p from "@envden/core/protocol";
import { filterRepairReports, decodeServerObject } from "@envden/core/chain";
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
    reports: encoded.flatMap((r) => {
      const result = decodeServerObject({
        received: binary(r),
        codec: p.RepairReportCodec,
        label: "repair-report",
        mismatch: "fork",
        members: [...history.state.devices.values()],
        currentVersion: VERSION,
        latestVersion: context.local.latest ?? VERSION,
      });

      if (result.kind === "known") return [result.value];

      if (result.kind === "update-required")
        throw new EnvdenError("UPDATE_REQUIRED", "Update envden to read server data");

      if (result.kind === "unreadable")
        throw new EnvdenError("INVALID_DATA", "Unreadable data from server");

      return [];
    }),
    repairId: context.repairId,
    state: history.state,
    headerHashes: new Set(
      history.headers.map((h) => p.base32(p.objectHash(p.ManifestHeaderCodec, h, "manifest"))),
    ),
  });

  return reports;
}
