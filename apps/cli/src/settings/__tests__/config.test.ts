import { telemetryEnabled, updateCheckEnabled } from "../privacy.ts";
import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig, readConfig, setConfig } from "../config.ts";
import { paths } from "../paths.ts";

test("config validates, persists and uses private paths", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-config-"));

  try {
    expect((await readConfig(home)).telemetry).toBe(false);
    await setConfig("telemetry", "on", home);
    expect((await readConfig(home)).telemetry).toBe(true);
    expect((await stat(paths(home).config)).mode & 0o777).toBe(0o600);
    expect((await stat(paths(home).state)).mode & 0o777).toBe(0o700);
    expect(setConfig("bad", "on", home)).rejects.toThrow();
    expect(() => parseConfig({ telemetry: "yes" })).toThrow();
    expect(() => parseConfig({ "allow-version": "latest" })).toThrow();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("privacy overrides and defaults", () => {
  expect(telemetryEnabled(undefined, false, {})).toBe(false);
  expect(telemetryEnabled(undefined, true, {})).toBe(false);
  expect(telemetryEnabled(true, false, {})).toBe(true);
  expect(telemetryEnabled(true, true, { DO_NOT_TRACK: "1" })).toBe(false);
  expect(telemetryEnabled(true, true, { ENVDEN_TELEMETRY: "0" })).toBe(false);
  expect(updateCheckEnabled(true, { ENVDEN_NO_UPDATE_CHECK: "1" })).toBe(false);
  expect(updateCheckEnabled(true, {})).toBe(true);
});
