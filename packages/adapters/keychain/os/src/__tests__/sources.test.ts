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
    set.mockResolvedValueOnce(undefined);
    await createOsKeychainAdapter({ home }).set("os", new Uint8Array([1]));
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
        expect(await adapter.get("key")).toBeUndefined();
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

test("file-only deletion leaves OS keys untouched and unmarked reads use file fallback", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-delete-"));
  let value: string | null = "AQ==";
  const get = spyOn(Bun.secrets, "get").mockImplementation(async () => value);

  const remove = spyOn(Bun.secrets, "delete").mockImplementation(async () => {
    value = null;

    return true;
  });

  try {
    await createOsKeychainAdapter({ home, fileOnly: true }).delete("os");
    expect(remove).not.toHaveBeenCalled();
    expect(await createOsKeychainAdapter({ home }).get("os")).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
    expect(await readdir(home)).toEqual([]);
  } finally {
    get.mockRestore();
    remove.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});

for (const operation of ["get", "set", "delete"] as const) {
  test(`OS history refuses unavailable ${operation}`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-history-"));
    const get = spyOn(Bun.secrets, "get").mockResolvedValue("AQ==");
    const set = spyOn(Bun.secrets, "set").mockResolvedValue(undefined);
    const remove = spyOn(Bun.secrets, "delete").mockRejectedValue(new Error("unavailable"));

    try {
      await createOsKeychainAdapter({ home }).set("old", new Uint8Array([1]));
      get.mockRejectedValue(new Error("unavailable"));
      set.mockRejectedValue(new Error("unavailable"));
      const adapter = createOsKeychainAdapter({ home });

      const action =
        operation === "get"
          ? adapter.get("old")
          : operation === "set"
            ? adapter.set("new", new Uint8Array([2]))
            : adapter.delete("old");

      await Promise.resolve(expect(action).rejects.toMatchObject({ code: "LOCKED" }));
    } finally {
      get.mockRestore();
      set.mockRestore();
      remove.mockRestore();
      await rm(home, { recursive: true, force: true });
    }
  });
}

test("headless first setup permits fallback but required reads fail closed", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-headless-"));

  const failure = new Error(
    "The name org.freedesktop.secrets was not provided by any .service files",
  );

  const get = spyOn(Bun.secrets, "get").mockRejectedValue(failure);
  const set = spyOn(Bun.secrets, "set").mockRejectedValue(failure);
  const remove = spyOn(Bun.secrets, "delete").mockRejectedValue(failure);

  try {
    const adapter = createOsKeychainAdapter({ home });
    expect(await adapter.get("new")).toBeUndefined();

    await Promise.resolve(
      expect(adapter.get("new", true)).rejects.toMatchObject({ code: "LOCKED" }),
    );

    await adapter.delete("pair-receive");
    await adapter.set("new", new Uint8Array([7]));
    expect(await adapter.get("new", true)).toEqual(new Uint8Array([7]));
    expect(adapter.takeFallbackNotice?.()).toBe(true);
  } finally {
    get.mockRestore();
    set.mockRestore();
    remove.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});

for (const failure of ["locked", "unknown failure", "User interaction is not allowed"]) {
  test(`a new OS slot cannot fall back after ${failure}`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-refuse-fallback-"));
    const get = spyOn(Bun.secrets, "get").mockResolvedValue(null);
    const set = spyOn(Bun.secrets, "set").mockRejectedValue(new Error(failure));

    try {
      const adapter = createOsKeychainAdapter({ home });

      await Promise.resolve(
        expect(adapter.set("new", new Uint8Array([1]))).rejects.toMatchObject({ code: "LOCKED" }),
      );

      expect(adapter.takeFallbackNotice?.()).toBe(false);
      expect(await adapter.get("new")).toBeUndefined();
    } finally {
      get.mockRestore();
      set.mockRestore();
      await rm(home, { recursive: true, force: true });
    }
  });
}

test("a successful OS write persists home history across adapters", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-written-os-"));
  const get = spyOn(Bun.secrets, "get").mockResolvedValue(null);
  const set = spyOn(Bun.secrets, "set").mockResolvedValue(undefined);

  try {
    await createOsKeychainAdapter({ home }).set("key", new Uint8Array([1]));
    get.mockRejectedValue(new Error("unavailable"));

    await Promise.resolve(
      expect(createOsKeychainAdapter({ home }).get("key")).rejects.toMatchObject({
        code: "LOCKED",
      }),
    );
  } finally {
    get.mockRestore();
    set.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});

test("the OS source marker exists before the keychain write", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-marker-first-"));
  const marker = join(home, "state", "keys", "os.file");
  let marked = false;

  const set = spyOn(Bun.secrets, "set").mockImplementation(async () => {
    marked = await Bun.file(marker).exists();
  });

  try {
    await createOsKeychainAdapter({ home }).set("key", new Uint8Array([1]));
    expect(marked).toBe(true);
  } finally {
    set.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});
