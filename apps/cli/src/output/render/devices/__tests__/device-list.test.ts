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

test("device list marks this device and hides ids unless asked", () => {
  expect(deviceListText(devices)).toBe(
    [
      "* mainbook  this device · v0.3.2 · has held the recovery keys",
      "  laptop-b  v0.3.2",
      "  old       not confirmed yet · has held the recovery keys",
    ].join("\n"),
  );

  expect(deviceListText(devices.slice(1, 2), true)).toBe("  laptop-b  v0.3.2 · id ID2");
  expect(deviceListText([])).toBe("No devices");
});
