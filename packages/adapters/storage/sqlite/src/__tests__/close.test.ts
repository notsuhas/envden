import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteStorageAdapter } from "../index.ts";

test("a closed database leaves only envden.sqlite, with its writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "envden-sqlite-close-"));

  try {
    const storage = createSqliteStorageAdapter(dir, 0);
    const vault = new Uint8Array([1]);

    storage.configureVault(vault, {
      active: true,
      frozen: false,
      skRefused: false,
      unlockPeriod: null,
    });

    storage.close();

    expect(readdirSync(dir).filter((name) => name.startsWith("envden.sqlite"))).toEqual([
      "envden.sqlite",
    ]);

    const reopened = createSqliteStorageAdapter(dir, 0);
    expect(reopened.hasVault(vault)).toBe(true);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
