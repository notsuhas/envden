import { expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execTrustedSync } from "@envden/core/process";
import { createSqliteStorageAdapter } from "../index.ts";

function temp(): string {
  return mkdtempSync(join(tmpdir(), "envden-sqlite-acl-"));
}

test("startup restricts the data folder and database files with the shared ACL helper", async () => {
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

test.skipIf(process.platform !== "win32")(
  "on Windows the data folder and database inherit no access from their parent",
  () => {
    const dir = temp();

    try {
      createSqliteStorageAdapter(dir, 0).close();

      for (const path of [dir, join(dir, "envden.sqlite")])
        expect(execTrustedSync("icacls", [path])).not.toContain("(I)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
