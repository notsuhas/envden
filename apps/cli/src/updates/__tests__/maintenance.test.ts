import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { refreshInstallation } from "../self/maintenance.ts";
import { releasePlatform } from "../self/platform.ts";
import { restartHostService } from "../../agent/service/restart.ts";
import { installMethod } from "../install.ts";

const fixtureClock = () => 1800000000000;

test("release assets distinguish musl, glibc and Windows", () => {
  expect(releasePlatform("linux", "arm64")).toBe("linux-arm64-musl");
  expect(releasePlatform("linux", "x64", "2.36")).toBe("linux-x64");
  expect(releasePlatform("win32", "x64")).toBe("windows-x64");
});

test("installer environment precedes a stale marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-install-env-"));
  const before = process.env.ENVDEN_INSTALL_METHOD;

  try {
    await atomicWrite(join(root, "install-method"), "script", fixtureClock);
    process.env.ENVDEN_INSTALL_METHOD = "brew";

    expect(await installMethod(root)).toEqual({
      kind: "manager",
      command: ["brew", "upgrade", "envden"],
    });
  } finally {
    if (before === undefined) delete process.env.ENVDEN_INSTALL_METHOD;
    else process.env.ENVDEN_INSTALL_METHOD = before;

    await rm(root, { recursive: true, force: true });
  }
});

test("post-swap refresh only updates installed skills and tolerates shell failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-refresh-"));

  try {
    const adapters = createAdapters(
      {
        home: join(root, "home"),
        userHome: root,
        keychain: createMemoryKeychainAdapter([]),
      },
      fixtureClock,
    );

    let shells = 0;

    adapters.shell = () => ({
      id: "test",
      installed: async () => true,
      install: async () => {
        shells++;
        throw new Error("failed");
      },
      uninstall: async () => {},
      rcPath: () => "",
      hookSnippet: () => "",
    });

    await refreshInstallation(adapters, "/bin/envden");
    expect(shells).toBe(4);
    const skill = join(root, ".agents", "skills", "envden", "SKILL.md");
    expect(await Bun.file(skill).exists()).toBe(false);
    await atomicWrite(skill, "old", fixtureClock);
    await refreshInstallation(adapters, "/bin/envden");
    expect(await readFile(skill, "utf8")).toContain("Run envden status");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("service restart requires an installed definition", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-restart-"));

  try {
    const calls: string[][] = [];

    const run = async (args: string[]) => {
      calls.push(args);
    };

    await restartHostService(root, root, "linux", run);
    expect(calls).toEqual([]);

    await atomicWrite(
      join(root, ".config", "systemd", "user", "envden.service"),
      "unit",
      fixtureClock,
    );

    await restartHostService(root, root, "linux", run);
    expect(calls).toEqual([["systemctl", "--user", "restart", "envden.service"]]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
