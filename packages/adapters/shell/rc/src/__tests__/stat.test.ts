import { test, expect, spyOn } from "bun:test";
import { mkdtemp, writeFile, open, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rcStat } from "../files/stat.ts";

test("rc timestamp baseline comes from lstat even if fstat rounds timestamps", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-rc-stat-"));
  const path = join(home, "rc");
  await writeFile(path, "original");
  const file = await open(path, "r");
  const opened = await file.stat();

  const mocked = spyOn(file, "stat").mockResolvedValue(
    Object.assign(opened, { ctimeMs: Math.floor(opened.ctimeMs) - 0.125 }),
  );

  try {
    expect((await rcStat(file, path)).ctimeMs).toBe((await lstat(path)).ctimeMs);
    expect(mocked).toHaveBeenCalled();
  } finally {
    mocked.mockRestore();
    await file.close();
    await rm(home, { recursive: true, force: true });
  }
});
