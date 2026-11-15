import type { IDeviceView } from "../../../view/model.ts";
import { el } from "../dom.ts";
import { renameControl, type TRename } from "./rename.ts";

export function renderDevices(target: HTMLElement, devices: IDeviceView[], rename: TRename) {
  target.replaceChildren(
    el(
      "ul",
      { className: "cells", label: "Devices" },
      devices.map((device) =>
        el("li", { className: "cell" }, [
          el("h3", { text: device.name }),
          el("span", { className: device.current ? "accent" : "muted", text: flags(device) }),
          el("span", {
            className: "mono muted",
            text: device.clientVersion ? `v${device.clientVersion}` : "version unknown",
          }),
          ...(device.current ? [renameControl(device.name, rename)] : []),
        ]),
      ),
    ),
  );
}

function flags(device: IDeviceView) {
  return (
    [
      device.current ? "this device" : "",
      device.unconfirmed ? "unconfirmed" : "",
      device.recoveryKeyHeld ? "holds recovery key" : "",
    ]
      .filter(Boolean)
      .join(" · ") || "member"
  );
}
