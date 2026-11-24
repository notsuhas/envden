import { expect, test } from "bun:test";
import { settingRequest } from "../request.ts";

for (const [key, values, expected] of [
  [undefined, [], { kind: "list" }],
  ["telemetry", [], { kind: "read", key: "telemetry" }],
  ["telemetry", ["off"], { kind: "set", key: "telemetry", value: "off" }],
  ["env-files", ["{}"], { kind: "set", key: "env-files", value: "{}" }],
  ["placement", [".", "copy"], { kind: "placement", checkout: ".", mode: "copy" }],
] as const)
  test(`setting request ${key} ${values.join(" ")}`, () => {
    expect(settingRequest(key, [...values])).toEqual(expected);
  });

for (const [key, values, message] of [
  ["telemtry", ["off"], "'telemtry'"],
  ["unlock-period", ["7d"], "'unlock-period'"],
  ["telemetry", ["yes"], "on or off"],
  ["telemetry", ["on", "off"], "one value"],
  ["placement", ["."], "link|copy"],
] as const)
  test(`setting request rejects ${key} ${values.join(" ")}`, () => {
    expect(() => settingRequest(key, [...values])).toThrow(message);
  });
