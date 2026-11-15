import { expect, test } from "bun:test";
import { parseConfig } from "../../../settings/config.ts";
import { configText, settingText, unlockPeriodText } from "../settings.ts";

test("settings print as words, not JSON", () => {
  const config = parseConfig({ placement: { "/repo": "copy" } });

  expect(configText(config, {}).split("\n")).toEqual([
    "telemetry: off",
    "update-check: on",
    "agent-merge: off",
    "auto-approve-worktrees: on",
    "placement:",
    "  /repo: copy",
    "env-files: default",
  ]);

  expect(settingText("update-check", config, { ENVDEN_NO_UPDATE_CHECK: "1" })).toBe(
    "update-check: off (set to on; the environment overrides it)",
  );
});

for (const [period, expected] of [
  [86400000, "unlock-period: 1d"],
  [604800000, "unlock-period: 7d"],
  [2592000000, "unlock-period: 30d"],
  [null, "unlock-period: never"],
] as const)
  test(`unlock period ${period} reads as ${expected}`, () => {
    expect(unlockPeriodText(period)).toBe(expected);
  });
