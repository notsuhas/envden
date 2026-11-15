import { expect, test } from "bun:test";
import { deviceListText } from "../device-list.ts";

const device = {
  id: "ID1",
  name: "mainbook",
  clientVersion: "0.3.2",
  unconfirmed: false,
  recoveryKeyHeld: true,
  current: true,
};

const devices = [
  device,
  { ...device, id: "ID2", name: "laptop-b", recoveryKeyHeld: false, current: false },
  { ...device, id: "ID3", name: "old", clientVersion: null, unconfirmed: true, current: false },
];

test("device list marks this device, aligns names and hides ids unless asked", () => {
  const [mine, other, old] = deviceListText(devices).split("\n");

  expect(mine).toMatch(/^\* mainbook  this device · v0\.3\.2 · .*recovery keys$/);
  expect(other).toBe("  laptop-b  v0.3.2");
  expect(old).toMatch(/^ {2}old {7}not confirmed yet · .*recovery keys$/);
  expect(deviceListText(devices.slice(1, 2), true)).toEndWith("· id ID2");
  expect(deviceListText([])).toMatch(/no devices/i);
});
