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

    if (process.platform !== "win32")
      expect((await stat(paths(home).config)).mode & 0o777).toBe(0o600);

    if (process.platform !== "win32")
      expect((await stat(paths(home).state)).mode & 0o777).toBe(0o700);

    expect(setConfig("bad", "on", home)).rejects.toThrow();
    expect(() => parseConfig({ telemetry: "yes" })).toThrow();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("privacy overrides and defaults", () => {
  expect(telemetryEnabled(undefined, {})).toBe(false);
  expect(telemetryEnabled(true, {})).toBe(true);
  expect(telemetryEnabled(true, { DO_NOT_TRACK: "1" })).toBe(false);
  expect(telemetryEnabled(true, { ENVDEN_TELEMETRY: "0" })).toBe(false);
  expect(updateCheckEnabled(true, { ENVDEN_NO_UPDATE_CHECK: "1" })).toBe(false);
  expect(updateCheckEnabled(true, {})).toBe(true);
});

test("structured placement and env-file rules persist and reject invalid values", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-rules-"));

  try {
    const rules = { include: [".env*"], exclude: ["*.example"], extraSkipped: ["generated"] };
    await setConfig("env-files", JSON.stringify(rules), home);
    await setConfig("placement", JSON.stringify({ "/checkout": "copy" }), home);

    expect(await readConfig(home)).toMatchObject({
      "env-files": rules,
      placement: { "/checkout": "copy" },
    });

    expect(() => parseConfig({ "env-files": { include: "*" } })).toThrow();
    expect(() => parseConfig({ placement: { "/checkout": "bad" } })).toThrow();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
