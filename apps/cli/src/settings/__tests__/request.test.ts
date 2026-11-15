import { expect, test } from "bun:test";
import { settingRequest } from "../request.ts";

for (const [key, values, expected] of [
  [undefined, [], { kind: "list" }],
  ["telemetry", [], { kind: "read", key: "telemetry" }],
  ["telemetry", ["off"], { kind: "set", key: "telemetry", value: "off" }],
  ["env-files", ["{}"], { kind: "set", key: "env-files", value: "{}" }],
  ["unlock-period", ["7d"], { kind: "unlock-period", value: "7d" }],
  ["placement", [".", "copy"], { kind: "placement", checkout: ".", mode: "copy" }],
] as const)
  test(`setting request ${key} ${values.join(" ")}`, () => {
    expect(settingRequest(key, [...values])).toEqual(expected);
  });

for (const [key, values, message] of [
  ["telemtry", ["off"], "Unknown setting 'telemtry'. Valid settings: telemetry, update-check"],
  ["bogus", [], "Unknown setting 'bogus'"],
  ["unlock-period", ["2d"], "Expected 1d, 7d, 30d or never"],
  ["telemetry", ["yes"], "Expected on or off for telemetry"],
  ["telemetry", ["on", "off"], "Expected one value for telemetry"],
  ["placement", ["."], "Expected placement <checkout> link|copy"],
] as const)
  test(`setting request rejects ${key} ${values.join(" ")}`, () => {
    expect(() => settingRequest(key, [...values])).toThrow(message);
  });
