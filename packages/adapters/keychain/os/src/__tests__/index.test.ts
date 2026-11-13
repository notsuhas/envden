import { rejects } from "node:assert/strict";
import { EnvdenError } from "@envden/core/errors";
import { execFileSync } from "node:child_process";
import { expect, spyOn, test } from "bun:test";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOsKeychainAdapter } from "../index.ts";

test("file fallback preserves bytes, isolates names and deletes", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-keys-"));

  try {
    const adapter = createOsKeychainAdapter({ home, fileOnly: true });
    expect(await adapter.available()).toBe(false);
    expect(await adapter.get("absent")).toBeUndefined();
    await adapter.set("../name", new Uint8Array([0, 255, 128]));

    expect(await createOsKeychainAdapter({ home, fileOnly: true }).get("../name")).toEqual(
      new Uint8Array([0, 255, 128]),
    );

    await adapter.delete("../name");
    expect(await adapter.get("../name")).toBeUndefined();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test.skipIf(!!process.env.CI || process.env.ENVDEN_TEST_KEYCHAIN !== "1")(
  "real keychain roundtrip",
  async () => {
    const adapter = createOsKeychainAdapter();
    expect(await adapter.available()).toBe(true);
    const name = `test-${crypto.randomUUID()}`;

    try {
      await adapter.set(name, new Uint8Array([0, 255]));
      expect(await adapter.get(name)).toEqual(new Uint8Array([0, 255]));
    } finally {
      await adapter.delete(name);
    }
  },
);

test("key storage failures use a fixed typed message", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-key-error-"));

  try {
    await writeFile(join(home, "state"), "private contents");
    const adapter = createOsKeychainAdapter({ home, fileOnly: true });
    await rejects(adapter.set("key", new Uint8Array([1])), EnvdenError);

    await rejects(adapter.set("key", new Uint8Array([1])), /Key storage operation failed/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test.skipIf(process.platform !== "win32")(
  "file fallback removes inherited Windows ACL entries",
  async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-key-acl-"));

    try {
      await createOsKeychainAdapter({ home, fileOnly: true }).set("key", new Uint8Array([1]));
      const directory = join(home, "state", "keys");

      for (const file of await readdir(directory)) {
        const acl = execFileSync("icacls", [join(directory, file)], { encoding: "utf8" });
        expect(acl).not.toContain("(I)");
      }
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
);

test.skipIf(process.platform === "win32")(
  "fallback file and directory modes are private",
  async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-key-mode-"));

    try {
      await createOsKeychainAdapter({ home, fileOnly: true }).set("key", new Uint8Array([1]));
      const directory = join(home, "state", "keys");
      expect((await stat(directory)).mode & 0o777).toBe(0o700);

      for (const file of await readdir(directory))
        expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  },
);

test.skipIf(process.platform !== "win32")("Windows credentials persist locally", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-key-persist-"));
  const set = spyOn(Bun.secrets, "set").mockResolvedValue(undefined);
  const remove = spyOn(Bun.secrets, "delete").mockResolvedValue(true);

  try {
    const adapter = createOsKeychainAdapter({ home });
    expect(await adapter.available()).toBe(true);
    await adapter.set("key", new Uint8Array([1]));
    expect(set.mock.calls.every(([options]) => options.persist === "local")).toBe(true);
  } finally {
    set.mockRestore();
    remove.mockRestore();
    await rm(home, { recursive: true, force: true });
  }
});
