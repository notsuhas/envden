import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile, rename, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { refreshInstallation } from "../self/maintenance.ts";
import { releasePlatform } from "../self/platform.ts";
import { installMethod } from "../install.ts";

const fixtureClock = () => 1800000000000;

test("release assets distinguish musl and glibc", () => {
  expect(releasePlatform("linux", "arm64")).toBe("linux-arm64-musl");
  expect(releasePlatform("linux", "x64", "2.36")).toBe("linux-x64");
  expect(releasePlatform("darwin", "arm64")).toBe("darwin-arm64");
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

    await refreshInstallation(adapters, "linux");
    expect(shells).toBe(4);
    const skill = join(root, ".agents", "skills", "envden", "SKILL.md");
    expect(await Bun.file(skill).exists()).toBe(false);
    await atomicWrite(skill, "---\nname: envden\n---\nold\n", fixtureClock);
    await refreshInstallation(adapters, "linux");
    expect(await readFile(skill, "utf8")).toContain("Run envden status");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refresh rewrites an installed service and hooks with the stable Homebrew path", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-refresh-service-"));

  try {
    const adapters = createAdapters(
      {
        home: join(root, "home"),
        userHome: root,
        keychain: createMemoryKeychainAdapter([]),
        executable: "/opt/homebrew/Cellar/envden/0.2.1/bin/envden",
      },
      fixtureClock,
    );

    const hooks: string[] = [];
    let services = 0;

    adapters.hostServer = async () => {
      services++;

      return { log: "", path: "" };
    };

    adapters.shell = () => ({
      id: "test",
      installed: async () => true,
      install: async (binary) => {
        hooks.push(binary);
      },
      uninstall: async () => {},
      rcPath: () => "",
      hookSnippet: () => "",
    });

    await refreshInstallation(adapters, "linux");
    expect(services).toBe(0);

    await atomicWrite(
      join(root, ".config", "systemd", "user", "envden.service"),
      "unit",
      fixtureClock,
    );

    await refreshInstallation(adapters, "linux");
    expect(services).toBe(1);

    const unit = join(root, ".config", "systemd", "user", "envden.service");
    await rename(unit, join(root, "dotfiles-unit"));
    await symlink(join(root, "dotfiles-unit"), unit);
    await refreshInstallation(adapters, "linux");
    expect(services).toBe(2);
    expect(adapters.executable).toBe("/opt/homebrew/bin/envden");
    expect(new Set(hooks)).toEqual(new Set(["/opt/homebrew/bin/envden"]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
