import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState } from "../../state/store/repository.ts";
import { releaseConfig } from "../release-config.ts";
import { runUpdateCheck } from "../run.ts";
import { selfUpdate } from "../self.ts";
import { replaceBinary, cleanupOldBinary } from "../replace.ts";

for (const valid of [true, false])
  test(`script self-update verifies signed build hash: ${valid}`, async () => {
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

    const original = { ...releaseConfig };
    const primary = p.generateRecoveryKeys();
    const backup = p.generateRecoveryKeys();
    const build = new TextEncoder().encode("new binary");

    const body: p.IRelease = {
      generation: 1,
      seq: 1n,
      issuedAt: 100n,
      expires: 2592000100n,
      latest: "1.0.0",
      unsafe: [],
      builds: [{ platform: `${process.platform}-${process.arch}`, sha256: p.sha256(build) }],
      revokePrimary: 0,
      next: undefined,
    };

    const feed = p.ReleaseFeedCodec.write({
      body,
      signatures: [{ key: 0, sig: p.Sign(primary.objSk, "release", p.ReleaseCodec.write(body)) }],
    });

    try {
      releaseConfig.trust = {
        generation: 1,
        keys: { primary: primary.objPub, backup: backup.objPub },
      };

      releaseConfig.buildUrl = () => "https://build.invalid/envden";
      await atomicWrite(join(adapters.home, "install-method"), "script");
      const binary = join(root, "envden");
      await atomicWrite(binary, "old binary");

      const action = selfUpdate(adapters, {
        binary,
        run: async (command) => {
          expect(command).toEqual([binary, "update", "--post-install"]);
        },
        now: 200,
        fetcher: async (input) =>
          new Response(
            (input instanceof Request ? input.url : input.toString()).includes("build.invalid")
              ? valid
                ? build
                : new Uint8Array([0])
              : feed,
          ),
      });

      if (valid) expect((await action).kind).toBe("updated");
      else await Promise.resolve(expect(action).rejects.toMatchObject({ code: "INVALID_DATA" }));

      expect(await readFile(binary, "utf8")).toBe(valid ? "new binary" : "old binary");
      expect(await loadState(adapters.home)).toBeUndefined();

      expect(await Bun.file(join(root, ".agents", "skills", "envden", "SKILL.md")).exists()).toBe(
        false,
      );
    } finally {
      releaseConfig.trust = original.trust;
      releaseConfig.buildUrl = original.buildUrl;
      await rm(root, { recursive: true, force: true });
    }
  });

test("fresh update check does not configure a vault", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-update-check-"));

  try {
    await runUpdateCheck(
      createAdapters({ home: root, userHome: root, keychain: createMemoryKeychainAdapter([]) }),
      100,
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
    await replaceBinary(binary, new TextEncoder().encode("new"), true);
    expect(await readFile(binary, "utf8")).toBe("new");
    expect(await readFile(binary + ".envden-old", "utf8")).toBe("old");
    await cleanupOldBinary(binary, true);
    expect(await Bun.file(binary + ".envden-old").exists()).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
