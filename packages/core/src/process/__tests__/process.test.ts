import { expect, test, spyOn } from "bun:test";
import {
  realpathSync,
  chmodSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  renameSync,
} from "node:fs";
import * as filesystem from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { resolveTrustedExecutable, sanitizedEnvironment, spawnTrusted } from "../index.ts";
import { setUntrustedRoots } from "../roots.ts";
import * as directoryPolicy from "../directories.ts";
import { fixedDirectories, managerRoots } from "../directories.ts";
import { insideWorkingTree, trustedDirectories, trustedOwnerAndMode } from "../trust.ts";

test("renamed and separate-git-dir checkouts on PATH cannot supply tools", () => {
  const root = mkdtempSync(join(tmpdir(), "envden-trust-"));
  const before = process.env.PATH;

  try {
    mkdirSync(join(root, ".git"));
    renameSync(join(root, ".git"), join(root, "metadata"));
    process.env.PATH = root;

    for (const name of ["git", "ssh", "brew", "tailscale", "ps", "launchctl", "envden-fake-tool"]) {
      writeFileSync(join(root, name), "#!/bin/sh\necho compromised", { mode: 0o755 });

      try {
        expect(resolveTrustedExecutable(name)).not.toStartWith(realpathSync(root));
      } catch (error) {
        expect(String(error)).toContain("Trusted executable unavailable");
      }
    }

    expect(sanitizedEnvironment().PATH!.split(delimiter)).not.toContain(root);
  } finally {
    process.env.PATH = before;
    rmSync(root, { recursive: true, force: true });
  }
});

test("registry rejects symlink targets and child directories without git markers", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "envden-registry-")));
  const checkout = join(root, "checkout");
  const bin = join(root, "bin");
  mkdirSync(checkout);
  mkdirSync(bin);
  writeFileSync(join(checkout, "tool"), "#!/bin/sh\nexit 0", { mode: 0o755 });
  symlinkSync(join(checkout, "tool"), join(bin, "tool"));
  symlinkSync(checkout, join(root, "alias"));
  setUntrustedRoots([checkout]);

  try {
    expect(() => resolveTrustedExecutable(join(bin, "tool"))).toThrow();
    expect(trustedDirectories([checkout, join(root, "alias"), bin])).toEqual([bin]);
    expect(insideWorkingTree(checkout)).toBe(true);
    expect(insideWorkingTree(`${checkout}-other`)).toBe(false);
  } finally {
    setUntrustedRoots([]);
    rmSync(root, { recursive: true, force: true });
  }
});

test("env shebang searches fixed system directories before user symlink payloads", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "envden-shebang-")));
  const system = join(root, "system");
  const user = join(root, "user");
  const checkout = join(root, "checkout");
  for (const dir of [system, user, checkout]) mkdirSync(dir);
  writeFileSync(join(system, "git"), "#!/bin/sh\nprintf system", { mode: 0o755 });
  writeFileSync(join(checkout, "git"), "#!/bin/sh\nprintf compromised", { mode: 0o755 });
  symlinkSync(join(checkout, "git"), join(user, "git"));
  const script = join(root, "script");
  writeFileSync(script, "#!/usr/bin/env git\n", { mode: 0o755 });
  setUntrustedRoots([checkout]);

  expect(fixedDirectories("darwin").slice(0, 4)).toEqual([
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ]);

  expect(fixedDirectories("linux")).not.toContain("/opt/homebrew/bin");
  const policy = spyOn(directoryPolicy, "fixedDirectories").mockReturnValue([system, user]);

  try {
    const child = spawnTrusted(script, []);
    expect(await new Response(child.stdout).text()).toBe("system");
    expect(await child.exited).toBe(0);
  } finally {
    policy.mockRestore();
    setUntrustedRoots([]);
    rmSync(root, { recursive: true, force: true });
  }
});

test("environment drops code loading variables and only keeps explicit git settings", () => {
  const env = sanitizedEnvironment(
    { GIT_CONFIG_NOSYSTEM: "1" },
    {
      HOME: "/home/test",
      XDG_CONFIG_HOME: "/home/test/.config",
      LANG: "C",
      LC_ALL: "C",
      PATH: ".",
      HOMEBREW_BASH_COMMAND: "payload",
      NODE_PATH: "payload",
      GIT_EXEC_PATH: "payload",
      NODE_OPTIONS: "payload",
      GIT_CONFIG_NOSYSTEM: "payload",
    },
  );

  expect(env.HOME).toBe("/home/test");
  expect(env.XDG_CONFIG_HOME).toBe("/home/test/.config");
  expect(env.LC_ALL).toBe("C");
  expect(env.GIT_CONFIG_NOSYSTEM).toBe("1");
  expect(env.HOMEBREW_BASH_COMMAND).toBeUndefined();
  expect(env.NODE_PATH).toBeUndefined();
  expect(env.GIT_EXEC_PATH).toBeUndefined();
  expect(env.NODE_OPTIONS).toBeUndefined();
  expect(env.PATH!.split(delimiter)).not.toContain(".");
  expect(env.PATH!.split(delimiter)).toEqual(trustedDirectories());
});

test("writable directories, git files, and symlinks into checkouts are rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "envden-trust-"));

  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "tool"), "#!/bin/sh\nexit 0", { mode: 0o755 });
    chmodSync(bin, 0o777);

    expect(() => resolveTrustedExecutable(join(bin, "tool"))).toThrow();

    chmodSync(bin, 0o700);
    writeFileSync(join(root, ".git"), "gitdir: elsewhere");
    const link = mkdtempSync(join(tmpdir(), "envden-link-"));

    try {
      symlinkSync(join(bin, "tool"), join(link, "tool"));
      expect(() => resolveTrustedExecutable(join(link, "tool"))).toThrow();
    } finally {
      rmSync(link, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sync subprocesses use the same executable and environment policy", () => {
  const before = process.env.NODE_PATH;

  try {
    process.env.NODE_PATH = "payload";

    const result = spawnTrusted("bun", ["-e", "process.exit(process.env.NODE_PATH ? 1 : 0)"], {
      sync: true,
    });

    expect(result.exitCode).toBe(0);
  } finally {
    process.env.NODE_PATH = before;
  }
});

test("a package manager root that is a git repository is not a user checkout", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "envden-manager-root-")));

  try {
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "bin"));

    expect(insideWorkingTree(join(root, "bin"))).toBe(true);
    expect(insideWorkingTree(join(root, "bin"), [root])).toBe(false);
    mkdirSync(join(root, "bin", "prefix"));
    mkdirSync(join(root, "bin", "prefix", ".git"));

    expect(insideWorkingTree(join(root, "bin", "prefix"), [join(root, "bin", "prefix")])).toBe(
      true,
    );

    expect(managerRoots("linux")).not.toContain("/opt/homebrew");
    expect(managerRoots("darwin", "arm64")).toEqual(["/opt/homebrew"]);
    expect(managerRoots("darwin", "x64")).toEqual(["/usr/local/Homebrew"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("group write is trusted only for privileged groups", () => {
  const uid = process.getuid?.() ?? 0;

  expect(trustedOwnerAndMode({ mode: 0o40775, uid, gid: 80 }, "linux")).toBe(false);
  expect(trustedOwnerAndMode({ mode: 0o40775, uid, gid: 80 }, "darwin")).toBe(true);
  expect(trustedOwnerAndMode({ mode: 0o40775, uid, gid: 0 }, "linux")).toBe(true);
  expect(trustedOwnerAndMode({ mode: 0o40775, uid, gid: 20 }, "linux")).toBe(false);
  expect(trustedOwnerAndMode({ mode: 0o40777, uid, gid: 80 }, "linux")).toBe(false);
});

test("manager bin is appended to fixed child PATH and rejected inside registered roots", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "envden-manager-bin-")));

  try {
    const expected = [...trustedDirectories(), root];

    expect(sanitizedEnvironment({}, { PATH: "/attacker" }, root).PATH!.split(delimiter)).toEqual(
      expected,
    );

    setUntrustedRoots([root]);
    expect(sanitizedEnvironment({}, {}, root).PATH!.split(delimiter)).toEqual(trustedDirectories());
  } finally {
    setUntrustedRoots([]);
    rmSync(root, { recursive: true, force: true });
  }
});

test("a fake Homebrew root on Linux is still a checkout", () => {
  const filesystemPolicy = spyOn(filesystem, "existsSync").mockImplementation(
    (path) => String(path) === join("/opt/homebrew", ".git"),
  );

  try {
    expect(insideWorkingTree("/opt/homebrew/bin", managerRoots("linux"))).toBe(true);
    expect(insideWorkingTree("/opt/homebrew/bin", managerRoots("darwin", "arm64"))).toBe(false);
  } finally {
    filesystemPolicy.mockRestore();
  }
});

test("the running runtime is trusted without trusting its directory or PATH", async () => {
  expect(resolveTrustedExecutable("bun")).toBe(process.execPath);
  expect(resolveTrustedExecutable(process.execPath)).toBe(process.execPath);
  const child = spawnTrusted("bun", ["-e", "process.stdout.write('runtime')"]);
  expect(await new Response(child.stdout).text()).toBe("runtime");
  expect(await child.exited).toBe(0);
});
