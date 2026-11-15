import { sanitizeConsole } from "../../sanitize.ts";
import type { listDevices } from "../../../admin/devices/list.ts";

type TDevice = Awaited<ReturnType<typeof listDevices>>[number];

export function deviceListText(devices: TDevice[], verbose = false) {
  if (!devices.length) return "No devices";

  const width = Math.max(...devices.map((device) => device.name.length));

  return sanitizeConsole(
    devices
      .map((device) => {
        const details = deviceDetails(device, verbose).join(" · ");

        return `${device.current ? "*" : " "} ${device.name.padEnd(width)}  ${details}`.trimEnd();
      })
      .join("\n"),
  );
}

function deviceDetails(device: TDevice, verbose: boolean) {
  return [
    ...(device.current ? ["this device"] : []),
    device.unconfirmed
      ? "not confirmed yet"
      : device.clientVersion
        ? `v${device.clientVersion}`
        : "version unknown",
    ...(device.recoveryKeyHeld ? ["has held the recovery keys"] : []),
    ...(verbose ? [`id ${device.id}`] : []),
  ];
}
