import { spawnTrusted } from "@envden/core/process";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseChecksums } from "../render.ts";

test("Scoop script writes a versioned manifest from release hashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "envden-scoop-"));
  const sums = resolve(import.meta.dir, "SHA256SUMS");
  const output = join(directory, "bucket/envden.json");

  try {
    const child = spawnTrusted(
      ["bun", resolve(import.meta.dir, "../../scoop-manifest.ts"), "1.2.3", sums, output],
      { stdout: "pipe", stderr: "pipe" },
    );

    expect(await child.exited).toBe(0);
    const manifest = JSON.parse(await readFile(output, "utf8"));
    const hashes = parseChecksums(await readFile(sums, "utf8"));
    expect(manifest.version).toBe("1.2.3");
    expect(manifest.architecture["64bit"].hash).toBe(hashes.get("envden-windows-x64.exe"));
    expect(manifest.architecture.arm64.hash).toBe(hashes.get("envden-windows-arm64.exe"));
    expect(manifest.architecture.arm64.url).toContain("/v1.2.3/");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
