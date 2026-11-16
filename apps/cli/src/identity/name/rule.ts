import { isDeviceName } from "@envden/core/protocol";

export const DEVICE_NAME_RULE = "Device names are 1-64 bytes with no invisible characters";

export function deviceNameProblem(name: string) {
  return isDeviceName(name) ? undefined : DEVICE_NAME_RULE;
}
