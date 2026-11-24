import { rejects } from "node:assert/strict";
import { EnvdenError } from "@envden/core/errors";
import { expect, test } from "bun:test";
import { chmod, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileKeychainAdapter } from "../index.ts";

async function withHome(run: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "envden-keys-"));

  try {
    await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test("keys are owner-only files that survive a new adapter", () =>
  withHome(async (home) => {
    const adapter = createFileKeychainAdapter({ home });
    expect(await adapter.ownerOnly()).toBe(true);
    await adapter.set("../name", new Uint8Array([0, 255, 128]));

    expect(await createFileKeychainAdapter({ home }).get("../name")).toEqual(
      new Uint8Array([0, 255, 128]),
    );

    const directory = join(home, "state", "keys");
    expect((await stat(directory)).mode & 0o777).toBe(0o700);

    for (const file of await readdir(directory))
      expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);
  }));

test("file keys with long names fit in one path component", () =>
  withHome(async (home) => {
    const adapter = createFileKeychainAdapter({ home });
    const name = "k".repeat(200);
    await adapter.set(name, new Uint8Array([7]));
    expect(await adapter.get(name)).toEqual(new Uint8Array([7]));
  }));

test("a required key that isn't stored fails closed", () =>
  withHome(async (home) => {
    await Promise.resolve(
      expect(createFileKeychainAdapter({ home }).get("device", true)).rejects.toMatchObject({
        code: "LOCKED",
        message: expect.stringContaining("run envden join"),
      }),
    );
  }));

for (const target of ["file", "directory"] as const)
  test(`a ${target} readable by others is reported`, () =>
    withHome(async (home) => {
      const adapter = createFileKeychainAdapter({ home });
      await adapter.set("key", new Uint8Array([1]));
      const directory = join(home, "state", "keys");

      if (target === "directory") await chmod(directory, 0o755);
      else for (const file of await readdir(directory)) await chmod(join(directory, file), 0o644);

      expect(await adapter.ownerOnly()).toBe(false);

      if (target === "file")
        await Promise.resolve(
          expect(adapter.get("key")).rejects.toMatchObject({ code: "INVALID_DATA" }),
        );
    }));

test("key storage failures use a fixed typed message", () =>
  withHome(async (home) => {
    await writeFile(join(home, "state"), "private contents");
    const adapter = createFileKeychainAdapter({ home });
    await rejects(adapter.set("key", new Uint8Array([1])), EnvdenError);
    await rejects(adapter.set("key", new Uint8Array([1])), /Key storage operation failed/);
  }));
