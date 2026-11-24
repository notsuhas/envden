import { telemetryEnabled, updateCheckEnabled } from "../privacy.ts";
import { expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig, readConfig, setConfig } from "../config.ts";
import { paths } from "../paths.ts";

test("config validates, persists and uses private paths", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-config-"));

  try {
    expect((await readConfig(home)).telemetry).toBe(false);
    await setConfig("telemetry", "on", home, () => 0);
    expect((await readConfig(home)).telemetry).toBe(true);

    expect((await stat(paths(home).config)).mode & 0o777).toBe(0o600);

    expect((await stat(paths(home).state)).mode & 0o777).toBe(0o700);

    expect(setConfig("bad", "on", home, () => 0)).rejects.toThrow();

    expect(setConfig("agent-merge", "on", home, () => 0, false)).rejects.toThrow(
      "requires a terminal",
    );

    await setConfig("agent-merge", "off", home, () => 0, false);
    await setConfig("agent-merge", "on", home, () => 0, true);
    expect((await readConfig(home))["agent-merge"]).toBe(true);
    expect((await readConfig(home))["auto-approve-worktrees"]).toBe(true);
    await setConfig("auto-approve-worktrees", "off", home, () => 0, false);
    expect((await readConfig(home))["auto-approve-worktrees"]).toBe(false);

    expect(setConfig("auto-approve-worktrees", "on", home, () => 0, false)).rejects.toThrow(
      "requires a terminal",
    );

    await setConfig("auto-approve-worktrees", "on", home, () => 0, true);
    expect((await readConfig(home))["auto-approve-worktrees"]).toBe(true);
    expect(() => parseConfig({ telemetry: "yes" })).toThrow();
    expect(() => parseConfig({ unknown: true })).toThrow();
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
    await setConfig("env-files", JSON.stringify(rules), home, () => 0);
    await setConfig("placement", JSON.stringify({ "/checkout": "copy" }), home, () => 0);

    expect(await readConfig(home)).toMatchObject({
      "env-files": rules,
      placement: { "/checkout": "copy" },
    });

    expect(() => parseConfig({ "env-files": { include: "*" } })).toThrow();
    expect(() => parseConfig({ placement: { "/checkout": "bad" } })).toThrow();

    const unsupported = { code: "INVALID_INPUT", message: "Unsupported env file pattern" };
    const bad = JSON.stringify({ include: [".env*"], exclude: ["apps[/]web/.env"] });

    await Promise.resolve(
      expect(setConfig("env-files", bad, home, () => 0)).rejects.toMatchObject(unsupported),
    );

    expect((await readConfig(home))["env-files"]).toEqual(rules);

    await writeFile(
      paths(home).config,
      JSON.stringify({ "env-files": { include: ["apps/{*,**}"] } }),
    );

    await Promise.resolve(expect(readConfig(home)).rejects.toMatchObject(unsupported));
    expect(parseConfig({ "env-files": { extraSkipped: ["[a"] } })["env-files"]).toBeDefined();

    for (const config of [
      { unknown: true, "env-files": { include: ["["] } },
      { "env-files": { include: ["["] }, telemetry: "bad" },
    ])
      expect(() => parseConfig(config)).toThrow("Invalid config");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
