import { test, expect } from "bun:test";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeKit } from "../output.ts";
import { parseKit } from "../input.ts";
import * as p from "@envden/core/protocol";

test("private recovery export round trips into join and never overwrites", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-kit-"));
  const path = join(root, "kit.json");

  const kit = {
    vaultId: p.base32(new Uint8Array(32)),
    secretKey: p.encodeSecretKey(new Uint8Array(16)),
  };

  try {
    await writeKit(path, kit);
    expect(parseKit(JSON.parse(await readFile(path, "utf8")))).toEqual(kit);
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(writeKit(path, {})).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Windows recovery export removes inherited ACLs", async () => {
  if (process.platform !== "win32") return;
  const { execFileSync } = await import("node:child_process");
  const root = await mkdtemp(join(tmpdir(), "envden-kit-acl-"));

  try {
    const path = join(root, "kit.json");
    await writeKit(path, {});
    expect(execFileSync("icacls", [path], { encoding: "utf8" })).not.toContain("(I)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
