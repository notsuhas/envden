import { test, expect } from "bun:test";
import { mkdtemp, rm, stat, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyState } from "../model.ts";
import { saveState, loadState } from "../store/repository.ts";
import { atomicWrite } from "../store/files.ts";

test("atomic state stays private and replaces old bytes", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-state-"));

  try {
    expect(await loadState(home)).toBeUndefined();
    const state = emptyState("test");
    await saveState(home, state);
    state.telemetry = true;
    await saveState(home, state);
    expect(await loadState(home)).toEqual(state);

    if (process.platform !== "win32")
      expect((await stat(join(home, "state"))).mode & 0o777).toBe(0o700);

    if (process.platform !== "win32")
      expect((await stat(join(home, "state", "device.json"))).mode & 0o777).toBe(0o600);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("atomic writes replace a symlink without touching its target", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-atomic-"));

  try {
    await atomicWrite(join(home, "target"), "original");
    await symlink(join(home, "target"), join(home, "link"));
    await atomicWrite(join(home, "link"), "new");
    expect(await readFile(join(home, "target"), "utf8")).toBe("original");
    expect(await readFile(join(home, "link"), "utf8")).toBe("new");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("state loading rejects an incomplete record", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-invalid-state-"));

  try {
    await atomicWrite(join(home, "state", "device.json"), "{}");
    await Promise.resolve(expect(loadState(home)).rejects.toMatchObject({ code: "INVALID_DATA" }));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("headers live in immutable objects outside device.json", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-headers-"));

  try {
    const state = emptyState("test");
    state.headers = ["first-header"];
    await saveState(home, state);
    const record = JSON.parse(await readFile(join(home, "state", "device.json"), "utf8"));
    expect(record.headers).toBeUndefined();
    expect(record.headerRefs).toHaveLength(1);
    const path = join(home, "state", "headers", record.headerRefs[0]);
    const before = (await stat(path)).mtimeMs;
    state.headers.push("second-header");
    await saveState(home, state);
    expect((await stat(path)).mtimeMs).toBe(before);
    expect((await loadState(home))!.headers).toEqual(state.headers);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
