import { EnvdenError } from "../../errors/envden-error.ts";
import { type IGenesis } from "./entry-payloads/genesis.ts";
import { GenesisCodec } from "./entry-payloads/genesis.ts";
import { type IAddDevice } from "./entry-payloads/add-device.ts";
import { AddDeviceCodec } from "./entry-payloads/add-device.ts";
import { type IRemoveDevice } from "./entry-payloads/remove-device.ts";
import { RemoveDeviceCodec } from "./entry-payloads/remove-device.ts";
import { type INewEpoch } from "./entry-payloads/new-epoch.ts";
import { NewEpochCodec } from "./entry-payloads/new-epoch.ts";
import { type IReplaceRecovery } from "./entry-payloads/replace-recovery.ts";
import { ReplaceRecoveryCodec } from "./entry-payloads/replace-recovery.ts";
import { type IServerMoved } from "./entry-payloads/server-moved.ts";
import { ServerMovedCodec } from "./entry-payloads/server-moved.ts";
import { type IRepairDone } from "./entry-payloads/repair-done.ts";
import { RepairDoneCodec } from "./entry-payloads/repair-done.ts";
import { codec, u8, concat, tagged, b32, u64, b16, header } from "../encoding/binary.ts";

export type TEntryPayload =
  | { kind: 0; payload: IGenesis }
  | { kind: 1; payload: IAddDevice }
  | { kind: 2; payload: IRemoveDevice }
  | { kind: 3; payload: INewEpoch }
  | { kind: 4; payload: IReplaceRecovery }
  | { kind: 5; payload: IServerMoved }
  | { kind: 6; payload: IRepairDone };

export const payloadCodec = codec<TEntryPayload>(
  (r) => {
    switch (u8.read(r)) {
      case 0:
        return { kind: 0, payload: GenesisCodec.read(r) };
      case 1:
        return { kind: 1, payload: AddDeviceCodec.read(r) };
      case 2:
        return { kind: 2, payload: RemoveDeviceCodec.read(r) };
      case 3:
        return { kind: 3, payload: NewEpochCodec.read(r) };
      case 4:
        return { kind: 4, payload: ReplaceRecoveryCodec.read(r) };
      case 5:
        return { kind: 5, payload: ServerMovedCodec.read(r) };
      case 6:
        return { kind: 6, payload: RepairDoneCodec.read(r) };
      default:
        throw new EnvdenError("UPDATE_REQUIRED", "Unknown entry kind");
    }
  },
  (v) => {
    switch (v.kind) {
      case 0:
        return concat(u8.write(v.kind), GenesisCodec.write(v.payload));
      case 1:
        return concat(u8.write(v.kind), AddDeviceCodec.write(v.payload));
      case 2:
        return concat(u8.write(v.kind), RemoveDeviceCodec.write(v.payload));
      case 3:
        return concat(u8.write(v.kind), NewEpochCodec.write(v.payload));
      case 4:
        return concat(u8.write(v.kind), ReplaceRecoveryCodec.write(v.payload));
      case 5:
        return concat(u8.write(v.kind), ServerMovedCodec.write(v.payload));
      case 6:
        return concat(u8.write(v.kind), RepairDoneCodec.write(v.payload));
    }
  },
);

export type TEntry = {
  vaultId: Uint8Array;
  seq: bigint;
  parent: Uint8Array;
  signer: Uint8Array;
} & TEntryPayload;

export const EntryCodec = codec<TEntry>(
  (r) => {
    tagged(1, r);

    const vaultId = b32.read(r),
      seq = u64.read(r),
      parent = b32.read(r),
      change = payloadCodec.read(r),
      signer = b16.read(r);

    return { vaultId, seq, parent, ...change, signer };
  },
  (v) =>
    concat(
      header(1),
      b32.write(v.vaultId),
      u64.write(v.seq),
      b32.write(v.parent),
      payloadCodec.write(v),
      b16.write(v.signer),
    ),
);
