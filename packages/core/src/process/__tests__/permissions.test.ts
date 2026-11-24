import { expect, test } from "bun:test";
import { mkdtemp, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restrictAccess, restrictAccessSync } from "../permissions.ts";

test("private files and directories get owner-only modes, synchronously or not", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-permissions-"));

  try {
    for (const sync of [false, true])
      for (const directory of [false, true]) {
        const path = join(root, `${sync}-${directory}`);

        if (directory) await mkdir(path, { mode: 0o755 });
        else await writeFile(path, "secret", { mode: 0o644 });

        if (sync) restrictAccessSync(path, directory);
        else await restrictAccess(path, directory);

        expect((await stat(path)).mode & 0o777).toBe(directory ? 0o700 : 0o600);
      }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
