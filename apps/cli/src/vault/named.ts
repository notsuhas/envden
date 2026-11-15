import type * as p from "@envden/core/protocol";
import { uniqueDeviceName } from "../identity/name/unique.ts";
import type { THistory } from "./history.ts";

export function namedForList(device: p.IDeviceRecord, history: THistory) {
  const taken = [...history.state.devices.values()].map((member) => member.name);

  return { ...device, name: uniqueDeviceName(device.name, taken) };
}
