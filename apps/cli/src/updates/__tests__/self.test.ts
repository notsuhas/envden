import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile, mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState } from "../../state/store/repository.ts";
import { RELEASE_REPOSITORY } from "../github.ts";
import { runUpdateCheck } from "../run.ts";
import { currentReleasePlatform } from "../self/platform.ts";
import { selfUpdate } from "../self.ts";
import { replaceBinary, cleanupOldBinary } from "../replace.ts";

for (const valid of [true, false])
  test(`script self-update verifies release checksum: ${valid}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "envden-update-"));

    const adapters = createAdapters({
      home: join(root, "home"),
      userHome: root,
      keychain: createMemoryKeychainAdapter([]),
    });

    adapters.shell = (shell) => ({
      id: shell,
      installed: async () => valid,
      install: async () => {
        throw new Error("Shell refresh failed after swap");
      },
      uninstall: async () => {},
      rcPath: () => "",
      hookSnippet: () => "",
    });

    const build = new TextEncoder().encode("new binary");
    const platform = currentReleasePlatform();
    const asset = `envden-${platform}${platform.startsWith("windows-") ? ".exe" : ""}`;

    try {
      await atomicWrite(join(adapters.home, "install-method"), "script");
      const binary = join(root, "envden");
      await atomicWrite(binary, "old binary");

      const action = selfUpdate(adapters, {
        binary,
        run: async (command) => {
          expect(command).toEqual(
            command[1] === "--version"
              ? [binary + ".envden-new" + (process.platform === "win32" ? ".exe" : ""), "--version"]
              : [binary, "update", "--post-install"],
          );
        },
        fetcher: async (input, options) => {
          expect(
            await Bun.file(join(adapters.home, "state", "write.lock", "owner.json")).exists(),
          ).toBe(false);

          const url = input instanceof Request ? input.url : input.toString();

          if (url.endsWith("/latest"))
            return new Response(null, {
              status: 302,
              headers: { location: `https://github.com/${RELEASE_REPOSITORY}/releases/tag/v1.0.0` },
            });

          expect(options?.redirect).toBe("follow");

          if (url.endsWith("SHA256SUMS"))
            return new Response(`${Buffer.from(p.sha256(build)).toString("hex")}  ${asset}\n`);

          return new Response(valid ? build : new Uint8Array([0]));
        },
      });

      if (valid) expect((await action).kind).toBe("updated");
      else await Promise.resolve(expect(action).rejects.toMatchObject({ code: "INVALID_DATA" }));

      expect(await readFile(binary, "utf8")).toBe(valid ? "new binary" : "old binary");
      expect(await loadState(adapters.home)).toBeUndefined();

      expect(await Bun.file(join(root, ".agents", "skills", "envden", "SKILL.md")).exists()).toBe(
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

test("fresh update check does not configure a vault", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-update-check-"));

  try {
    await runUpdateCheck(
      createAdapters({ home: root, userHome: root, keychain: createMemoryKeychainAdapter([]) }),
      100,
      true,
      async () => new Response(null, { status: 404 }),
    );

    expect(await loadState(root)).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Windows replacement keeps the old executable for next-start cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-exe-"));

  try {
    const binary = join(root, "envden.exe");
    await atomicWrite(binary, "old");
    await replaceBinary(binary, new TextEncoder().encode("new"), true, async () => {});
    expect(await readFile(binary, "utf8")).toBe("new");
    expect(await readFile(binary + ".envden-old", "utf8")).toBe("old");
    await cleanupOldBinary(binary, true);
    expect(await Bun.file(binary + ".envden-old").exists()).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const windows of [false, true])
  test(`replacement refuses an unstartable binary and restores after failed post-install: ${windows}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "envden-replace-"));
    const binary = join(root, "envden");

    try {
      await atomicWrite(binary, "old");

      await Promise.resolve(
        expect(
          replaceBinary(binary, new TextEncoder().encode("bad"), windows, async () => {
            throw new Error("cannot start");
          }),
        ).rejects.toThrow(),
      );

      expect(await readFile(binary, "utf8")).toBe("old");

      await Promise.resolve(
        expect(
          replaceBinary(
            binary,
            new TextEncoder().encode("new"),
            windows,
            async () => {},
            async () => {
              throw new Error("post-install failed");
            },
          ),
        ).rejects.toThrow(),
      );

      expect(await readFile(binary, "utf8")).toBe("old");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

for (const windows of [false, true])
  test(`backup failure cleans staged binary: ${windows}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "envden-backup-"));
    const binary = join(root, "envden");

    try {
      await atomicWrite(binary, "old");
      await mkdir(binary + ".envden-old");

      await Promise.resolve(
        expect(
          replaceBinary(binary, new Uint8Array([1]), windows, async () => {}),
        ).rejects.toThrow(),
      );

      expect(await readFile(binary, "utf8")).toBe("old");
      expect((await readdir(root)).some((name) => name.includes("envden-new"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

test("concurrent updates refuse the second before downloading", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-concurrent-update-"));

  try {
    const adapters = createAdapters({
      home: root,
      userHome: root,
      keychain: createMemoryKeychainAdapter([]),
    });

    const binary = join(root, "envden");
    await atomicWrite(join(root, "install-method"), "script");
    let entered!: () => void;
    let release!: () => void;

    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });

    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = selfUpdate(adapters, {
      binary,
      fetcher: async () => {
        entered();
        await paused;

        return new Response(null, {
          status: 302,
          headers: { location: `https://github.com/${RELEASE_REPOSITORY}/releases/tag/v0.0.0` },
        });
      },
    });

    await started;

    try {
      await Promise.resolve(
        expect(
          selfUpdate(adapters, {
            binary,
            fetcher: async () => {
              throw new Error("must not download");
            },
          }),
        ).rejects.toMatchObject({ code: "CONFLICT", message: "Another envden update is running" }),
      );
    } finally {
      release();
      await first;
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
