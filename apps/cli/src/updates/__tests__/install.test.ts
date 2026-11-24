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

    await atomicWrite(join(root, "install-method"), "brew", fixtureClock);

    expect(await installMethod(root)).toEqual({
      kind: "manager",
      command: ["brew", "upgrade", "envden"],
    });

    for (const method of ["unknown", "npm", "scoop", "winget"]) {
      await atomicWrite(join(root, "install-method"), method, fixtureClock);

      await Promise.resolve(
        expect(installMethod(root)).rejects.toMatchObject({ code: "INVALID_INPUT" }),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manager detection recognizes Homebrew prefixes", async () => {
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
