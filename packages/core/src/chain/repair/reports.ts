import { equal, RepairReportCodec, verifyObject } from "../../protocol/index.ts";
import type { IFiles, IRepairReport, ISigned } from "../../protocol/index.ts";
import type { IDeviceListState } from "../devices/state.ts";
import { id } from "../shared/validation.ts";

export function filterRepairReports(input: {
  reports: readonly ISigned<IRepairReport>[];
  repairId: Uint8Array;
  state: IDeviceListState;
  headerHashes: ReadonlySet<string>;
}): ISigned<IRepairReport>[] {
  return input.reports.filter((report) => {
    const r = report.body;
    const signer = input.state.devices.get(id(r.signer));

    return (
      signer !== undefined &&
      equal(r.vaultId, input.state.vaultId) &&
      equal(r.repairId, input.repairId) &&
      input.headerHashes.has(id(r.head)) &&
      verifyObject(RepairReportCodec, report, signer.objPub, "repair-report").ok
    );
  });
}

export function missingReportMembers(
  state: IDeviceListState,
  reports: readonly ISigned<IRepairReport>[],
) {
  const signers = new Set(reports.map((r) => id(r.body.signer)));

  return [...state.devices.values()].filter((d) => !signers.has(id(d.id)));
}

export function classifyMissingBlobs(
  files: IFiles,
  available: ReadonlySet<string>,
  reports: readonly ISigned<IRepairReport>[],
) {
  const reported = new Set(reports.flatMap((r) => r.body.blobs.map(id)));

  const missing = files.entries.filter(
    (e) => [1, 3].includes(e.state) && !available.has(id(e.blobHash)),
  );

  return {
    missing: missing.filter((e) => reported.has(id(e.blobHash))),
    lost: missing.filter((e) => !reported.has(id(e.blobHash))),
  };
}
