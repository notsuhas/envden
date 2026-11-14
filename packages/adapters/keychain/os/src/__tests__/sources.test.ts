import { rejects } from "node:assert/strict";
import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOsKeychainAdapter } from "../adapter.ts";

test("file keys remain authoritative and existing OS keys never fall back", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-sources-"));
  const get = spyOn(Bun.secrets, "get").mockResolvedValue("AQ==");
  const remove = spyOn(Bun.secrets, "delete").mockResolvedValue(true);
  const set = spyOn(Bun.secrets, "set").mockRejectedValue(new Error("locked"));

  try {
    await createOsKeychainAdapter({ home, fileOnly: true }).set("file", new Uint8Array([2]));
    const adapter = createOsKeychainAdapter({ home });
    expect(await adapter.get("file")).toEqual(new Uint8Array([2]));
    expect(get).not.toHaveBeenCalled();
    await adapter.delete("file");
    const reopened = createOsKeychainAdapter({ home });
    expect(await reopened.get("file")).toBeUndefined();
    await reopened.set("file", new Uint8Array([5]));
    expect(await reopened.get("file")).toEqual(new Uint8Array([5]));
    expect(get).not.toHaveBeenCalled();
    await rejects(adapter.set("os", new Uint8Array([3])));
    get.mockRejectedValue(new Error("locked"));
    await rejects(adapter.get("os"));
  } finally {
    get.mockRestore();
    set.mockRestore();
    remove.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});

test("new keys can fall back once and required file keys explain file-only mode", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-fallback-"));
  const get = spyOn(Bun.secrets, "get").mockResolvedValue(null);
  const remove = spyOn(Bun.secrets, "delete").mockResolvedValue(true);
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
    remove.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});

for (const failure of [
  "unavailable",
  "locked",
  "Secret Service is locked",
  "User interaction is not allowed",
]) {
  test(`throwing keychain reads handle ${failure} without losing keys`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-missing-"));
    const get = spyOn(Bun.secrets, "get").mockRejectedValue(new Error(failure));
    const set = spyOn(Bun.secrets, "set").mockRejectedValue(new Error(failure));

    try {
      const adapter = createOsKeychainAdapter({ home });

      if (failure !== "unavailable") {
        await rejects(adapter.set("key", new Uint8Array([7])));
        await rejects(adapter.get("key"));
      } else {
        expect(await adapter.get("key")).toBeUndefined();
        await adapter.set("key", new Uint8Array([7]));
        expect(await adapter.get("key")).toEqual(new Uint8Array([7]));
        expect(adapter.takeFallbackNotice?.()).toBe(true);
      }
    } finally {
      get.mockRestore();
      set.mockRestore();
      await rm(home, { recursive: true, force: true });
    }
  });
}

test("file-only deletion removes OS keys without inventing a file source", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-delete-"));
  let value: string | null = "AQ==";
  const get = spyOn(Bun.secrets, "get").mockImplementation(async () => value);

  const remove = spyOn(Bun.secrets, "delete").mockImplementation(async () => {
    value = null;

    return true;
  });

  try {
    await createOsKeychainAdapter({ home, fileOnly: true }).delete("os");
    expect(remove).toHaveBeenCalled();
    expect(await createOsKeychainAdapter({ home }).get("os")).toBeUndefined();
    expect(await readdir(home)).toEqual([]);
  } finally {
    get.mockRestore();
    remove.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});
