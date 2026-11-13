import type { IDeviceRecord, IRecoveryRecord } from "../../protocol/index.ts";

export interface IDeviceListState {
  vaultId: Uint8Array;
  seq: bigint;
  head: Uint8Array;
  devices: ReadonlyMap<string, IDeviceRecord>;
  recovery: IRecoveryRecord;
  epoch: number;
  serverPin: Uint8Array;
  everUsedIds: ReadonlySet<string>;
  repairIds: ReadonlySet<string>;
  commits: ReadonlyMap<number, Uint8Array>;
}

export type TDeviceListResult = { kind: "valid"; state: IDeviceListState } | { kind: "invalid" };
