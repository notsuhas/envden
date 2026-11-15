import { test, expect } from "bun:test";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeKit } from "../output.ts";
import { parseKit } from "../input.ts";
import * as p from "@envden/core/protocol";

test("private recovery export round trips into join", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-kit-"));
  const path = join(root, "kit.json");

  const kit = {
    vaultId: p.base32(new Uint8Array(32)),
    secretKey: p.encodeSecretKey(new Uint8Array(16)),
  };

  try {
    await writeKit(path, kit);
    expect(parseKit(await readFile(path, "utf8"))).toEqual(kit);
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.skipIf(process.platform !== "win32")(
  "Windows recovery export removes inherited ACLs",
  async () => {
    const { execTrustedSync: execFileSync } = await import("@envden/core/process");
    const root = await mkdtemp(join(tmpdir(), "envden-kit-acl-"));

    try {
      const path = join(root, "kit.json");
      await writeKit(path, {});
      expect(execFileSync("icacls", [path])).not.toContain("(I)");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("kit output preserves an existing kit and explains missing parents", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-kit-output-"));

  try {
    const path = join(home, "kit.json");
    await writeKit(path, { vault: "first" });

    await Promise.resolve(
      expect(writeKit(path, { vault: "second" })).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );

    expect(await Bun.file(path).json()).toEqual({ vault: "first" });

    await Promise.resolve(
      expect(writeKit(join(home, "missing", "kit.json"), {})).rejects.toMatchObject({
        code: "INVALID_INPUT",
      }),
    );

    await writeKit(join(home, "new-kit.json"), { vault: "second" });
    expect(await Bun.file(join(home, "new-kit.json")).json()).toEqual({ vault: "second" });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
