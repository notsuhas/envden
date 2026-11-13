import { expect, test } from "bun:test";
import {
  realpathSync,
  chmodSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { resolveTrustedExecutable, sanitizedEnvironment, spawnTrusted } from "../index.ts";
import { insideWorkingTree, trustedOwnerAndMode } from "../trust.ts";

for (const name of [
  "git",
  "ssh",
  "launchctl",
  "systemctl",
  "schtasks",
  "ps",
  "powershell.exe",
  "tailscale",
  "icacls",
  "npm",
  "brew",
  "bun",
  "sh",
]) {
  test(`${name} ignores a checkout PATH executable and runs a trusted one`, async () => {
    const root = mkdtempSync(join(tmpdir(), "envden-trust-"));
    const before = process.env.PATH;

    try {
      const checkout = join(root, "checkout");
      const bin = join(checkout, "bin");
      const trusted = join(root, "trusted");
      mkdirSync(bin, { recursive: true });
      mkdirSync(join(checkout, ".git"));
      mkdirSync(trusted);
      writeFileSync(join(bin, name), "#!/bin/sh\necho compromised", { mode: 0o755 });
      writeFileSync(join(trusted, name), "#!/bin/sh\nprintf trusted", { mode: 0o755 });
      process.env.PATH = [bin, trusted].join(delimiter);
      expect(resolveTrustedExecutable(name)).toBe(realpathSync(join(trusted, name)));
      const child = spawnTrusted(name, []);
      expect(await new Response(child.stdout).text()).toBe("trusted");
      expect(await child.exited).toBe(0);

      expect(() => resolveTrustedExecutable(join(bin, name))).toThrow(
        "Trusted executable unavailable",
      );
    } finally {
      process.env.PATH = before;
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("environment drops code loading variables and only keeps explicit git settings", () => {
  const env = sanitizedEnvironment(
    { GIT_CONFIG_NOSYSTEM: "1" },
    {
      HOME: "/home/test",
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
  expect(env.LC_ALL).toBe("C");
  expect(env.GIT_CONFIG_NOSYSTEM).toBe("1");
  expect(env.HOMEBREW_BASH_COMMAND).toBeUndefined();
  expect(env.NODE_PATH).toBeUndefined();
  expect(env.GIT_EXEC_PATH).toBeUndefined();
  expect(env.NODE_OPTIONS).toBeUndefined();
  expect(env.PATH!.split(delimiter)).not.toContain(".");
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
    const result = spawnTrusted("sh", ["-c", 'test -z "$NODE_PATH"'], { sync: true });
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("group write is trusted only for privileged groups", () => {
  const uid = process.getuid?.() ?? 0;

  expect(trustedOwnerAndMode({ mode: 0o40775, uid, gid: 80 })).toBe(true);
  expect(trustedOwnerAndMode({ mode: 0o40775, uid, gid: 0 })).toBe(true);
  expect(trustedOwnerAndMode({ mode: 0o40775, uid, gid: 20 })).toBe(false);
  expect(trustedOwnerAndMode({ mode: 0o40777, uid, gid: 80 })).toBe(false);
});
