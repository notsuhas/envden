import { equal } from "../../../protocol/index.ts";
import type { TEntry } from "../../../protocol/index.ts";
import { check, id } from "../../shared/validation.ts";
import type { IDeviceListState } from "../state.ts";

export function transitionEntry(state: IDeviceListState, e: TEntry) {
  const devices = new Map(state.devices);
  const everUsedIds = new Set(state.everUsedIds);
  const repairIds = new Set(state.repairIds);
  const commits = new Map(state.commits);
  let recovery = state.recovery;
  const epoch = state.epoch;
  let serverPin = state.serverPin;

  switch (e.kind) {
    case 0:
      check(false);
      break;
    case 1: {
      const d = e.payload.device;
      check(!everUsedIds.has(id(d.id)) && devices.size < 64 && epoch >= 1);
      check(![...devices.values()].some((v) => v.name === d.name));
      check(equal(e.payload.wrap.recipient, d.id));
      devices.set(id(d.id), d);
      everUsedIds.add(id(d.id));
      break;
    }
    case 2:
      check(
        devices.has(id(e.payload.device)) && devices.size > 1 && !equal(e.signer, e.payload.device),
      );

      devices.delete(id(e.payload.device));
      if (e.payload.newRecovery) recovery = e.payload.newRecovery;
      break;
    case 3:
      break;
    case 4:
      recovery = e.payload.recovery;
      break;
    case 5:
      check(equal(e.payload.oldPin, serverPin));
      serverPin = e.payload.newPin;
      break;
    case 6:
      check(!repairIds.has(id(e.payload.repairId)));
      repairIds.add(id(e.payload.repairId));
      break;
  }

  return { devices, everUsedIds, repairIds, commits, recovery, serverPin };
}
