import { chmod, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create } from "tar";

// Fixed modes, owner and mtime keep a rebuilt archive byte-identical to the published one.
export async function writeReleaseArchive(binary: string, license: string, output: string) {
  const stage = await mkdtemp(join(tmpdir(), "envden-archive-"));

  try {
    await copyFile(binary, join(stage, "envden"));
    await chmod(join(stage, "envden"), 0o755);
    await copyFile(license, join(stage, "LICENSE"));
    await chmod(join(stage, "LICENSE"), 0o644);

    await create(
      { file: output, cwd: stage, gzip: { level: 9 }, portable: true, mtime: new Date(0) },
      ["envden", "LICENSE"],
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
