import { expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteStorageAdapter } from "../index.ts";

function temp(): string {
  return mkdtempSync(join(tmpdir(), "envden-sqlite-permissions-"));
}

test("startup restricts the data folder and database files with the shared permissions helper", async () => {
  const processes = await import("@envden/core/process");
  const restricted: [string, boolean | undefined][] = [];

  const restrict = spyOn(processes, "restrictAccessSync").mockImplementation((path, directory) => {
    restricted.push([path, directory]);
  });

  const dir = temp();

  try {
    createSqliteStorageAdapter(dir, 0).close();
    expect(restricted).toContainEqual([dir, true]);
    expect(restricted).toContainEqual([join(dir, "envden.sqlite"), false]);
  } finally {
    restrict.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  }
});
