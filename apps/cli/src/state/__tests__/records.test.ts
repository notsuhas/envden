import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicWrite, optionalRead } from "../store/files.ts";
import { recoverSyncRecord } from "../store/records.ts";

const fixtureClock = () => 1800000000000;

test("interrupted quarantine retains the corruption hold", async () => {
  const root = await fs.mkdtemp(join(tmpdir(), "envden-corrupt-"));
  const path = join(root, "entry");
  const marker = join(root, "hold");
  await atomicWrite(path, "{invalid", fixtureClock);
  const rename = fs.rename;

  const moving = spyOn(fs, "rename").mockImplementation(async (source, destination) => {
    await rename(source, destination);
    if (source === path) throw new Error("Interrupted quarantine");
  });

  try {
    await Promise.resolve(
      expect(recoverSyncRecord(path, marker, JSON.parse, 1800000000000)).rejects.toThrow(
        "Interrupted quarantine",
      ),
    );

    const saved = await optionalRead(marker);
    expect(saved).toBeDefined();
    expect(await optionalRead(saved!)).toBe("{invalid");
  } finally {
    moving.mockRestore();
    await fs.rm(root, { recursive: true, force: true });
  }
});
