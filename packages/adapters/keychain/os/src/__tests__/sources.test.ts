import { rejects } from "node:assert/strict";
import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOsKeychainAdapter } from "../adapter.ts";

test("file keys remain authoritative and existing OS keys never fall back", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-sources-"));
  const get = spyOn(Bun.secrets, "get").mockResolvedValue("AQ==");
  const set = spyOn(Bun.secrets, "set").mockRejectedValue(new Error("locked"));

  try {
    await createOsKeychainAdapter({ home, fileOnly: true }).set("file", new Uint8Array([2]));
    const adapter = createOsKeychainAdapter({ home });
    expect(await adapter.get("file")).toEqual(new Uint8Array([2]));
    expect(get).not.toHaveBeenCalled();
    await rejects(adapter.set("os", new Uint8Array([3])));
    get.mockRejectedValue(new Error("locked"));
    await rejects(adapter.get("os"));
  } finally {
    get.mockRestore();
    set.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});

test("new keys can fall back once and required file keys explain file-only mode", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-fallback-"));
  const get = spyOn(Bun.secrets, "get").mockResolvedValue(null);
  const set = spyOn(Bun.secrets, "set").mockRejectedValue(new Error("unavailable"));

  try {
    const adapter = createOsKeychainAdapter({ home });
    await adapter.set("new", new Uint8Array([4]));
    expect(adapter.takeFallbackNotice?.()).toBe(true);
    expect(adapter.takeFallbackNotice?.()).toBe(false);
    expect(await adapter.get("new")).toEqual(new Uint8Array([4]));

    await rejects(
      createOsKeychainAdapter({ home, fileOnly: true }).get("missing", true),
      /Device keys are in the OS keychain/,
    );
  } finally {
    get.mockRestore();
    set.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});
