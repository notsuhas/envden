import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
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

    const directory = join(home, "state", "keys");

    for (const file of await readdir(directory))
      expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);

    expect((await stat(directory)).mode & 0o777).toBe(0o700);
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
