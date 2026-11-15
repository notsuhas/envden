import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite } from "../../state/store/files.ts";
import { installMethod } from "../install.ts";

const fixtureClock = () => 1800000000000;

test("installer marker is at home root and selects the manual command", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-method-"));

  try {
    expect(await installMethod(root, undefined, join(root, "bin", "envden"))).toEqual({
      kind: "script",
    });

    for (const [method, command] of [
      ["brew", ["brew", "upgrade", "envden"]],
      ["npm", ["npm", "i", "-g", "envden@latest"]],
      ["scoop", ["scoop", "update", "envden"]],
      ["winget", ["winget", "upgrade", "envden"]],
    ] as const) {
      await atomicWrite(join(root, "install-method"), method, fixtureClock);
      expect(await installMethod(root)).toEqual({ kind: "manager", command: [...command] });
    }

    await atomicWrite(join(root, "install-method"), "unknown", fixtureClock);

    await Promise.resolve(
      expect(installMethod(root)).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manager detection recognizes Homebrew prefixes and WinGet package paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-detection-"));

  try {
    for (const binary of [
      "/opt/homebrew/Cellar/envden/1/bin/envden",
      "/usr/local/Cellar/envden/1/bin/envden",
    ])
      expect(await installMethod(root, undefined, binary)).toEqual({
        kind: "manager",
        command: ["brew", "upgrade", "envden"],
      });

    expect(
      await installMethod(
        root,
        undefined,
        "C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Envden.Envden_1\\envden.exe",
      ),
    ).toEqual({ kind: "manager", command: ["winget", "upgrade", "envden"] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("script marker wins over a bare Homebrew-style bin path", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-stale-method-"));

  try {
    await atomicWrite(join(root, "install-method"), "script", fixtureClock);

    for (const binary of ["/opt/homebrew/bin/envden", "/usr/local/bin/envden"])
      expect(await installMethod(root, undefined, binary)).toEqual({ kind: "script" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
