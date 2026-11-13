import { fileURLToPath } from "node:url";
import { spawnTrusted } from "@envden/core/process";
import { Worker } from "node:worker_threads";
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  chmodSync,
  statSync,
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteStorageAdapter } from "../index.ts";

function temp(): string {
  return mkdtempSync(join(tmpdir(), "envden-sqlite-"));
}

describe("SQLite durability", () => {
  test("migrates a legacy database after a consistent backup including WAL", () => {
    const dir = temp();

    try {
      const db = new Database(join(dir, "envden.sqlite"));
      db.exec("PRAGMA journal_mode=WAL; CREATE TABLE legacy(value); INSERT INTO legacy VALUES(42)");
      const storage = createSqliteStorageAdapter(dir, 0);
      const backup = new Database(join(dir, "pre-1"));
      expect(backup.query<{ value: number }, []>("SELECT value FROM legacy").get()?.value).toBe(42);

      expect(
        backup.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version,
      ).toBe(0);

      backup.close();
      db.close();
      storage.close();
      utimesSync(join(dir, "pre-1"), 0, 0);
      const reopened = createSqliteStorageAdapter(dir, 30 * 86400000);
      expect(existsSync(join(dir, "pre-1"))).toBe(false);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refuses future schemas with an update instruction", () => {
    const dir = temp();

    try {
      const db = new Database(join(dir, "envden.sqlite"));
      db.exec("PRAGMA user_version=99");
      db.close();
      expect(() => createSqliteStorageAdapter(dir, 0)).toThrow("update envden");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("partial temporary files and published orphans never become visible", () => {
    const dir = temp();

    try {
      const path = join(dir, "blobs", "01");
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, ".tmp-interrupted"), new Uint8Array([9]));
      writeFileSync(join(path, "02"), new Uint8Array([3]));
      const storage = createSqliteStorageAdapter(dir, 0);
      expect(storage.getBlob(new Uint8Array([1]), new Uint8Array([2]))).toBeUndefined();
      storage.putBlob(new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3]));
      expect(readFileSync(join(path, "02"))).toEqual(Buffer.from([3]));
      storage.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const stage of ["partial", "published"]) {
    test(`process exit during ${stage} blob write leaves no visible partial object`, async () => {
      const dir = temp();

      try {
        const child = spawnTrusted(
          [
            process.execPath,
            fileURLToPath(new URL("./blob-crash.ts", import.meta.url)),
            dir,
            stage,
          ],
          { stdout: "ignore", stderr: "pipe" },
        );

        expect(await child.exited).toBe(77);
        const storage = createSqliteStorageAdapter(dir, 0);

        try {
          expect(storage.getBlob(new Uint8Array([1]), new Uint8Array([2]))).toBeUndefined();
          storage.putBlob(new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3, 4, 5]));

          expect(storage.getBlob(new Uint8Array([1]), new Uint8Array([2]))).toEqual(
            new Uint8Array([3, 4, 5]),
          );
        } finally {
          storage.close();
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  test("two concurrent workers committing the same head have exactly one winner", async () => {
    const dir = temp();
    createSqliteStorageAdapter(dir, 0).close();
    const barrier = new SharedArrayBuffer(4);
    const workers = [0, 1].map(() => new Worker(new URL("./cas.worker.ts", import.meta.url)));

    function message(worker: Worker): Promise<unknown> {
      return new Promise((resolve, reject) => {
        worker.once("message", resolve);
        worker.once("error", reject);
      });
    }

    try {
      const ready = workers.map(message);
      workers.forEach((worker, index) => worker.postMessage({ dir, index, barrier }));
      await Promise.all(ready);
      const results = workers.map(message);
      Atomics.store(new Int32Array(barrier), 0, 1);
      Atomics.notify(new Int32Array(barrier), 0);
      const values = await Promise.all(results);

      expect(
        values.filter(
          (value) =>
            typeof value === "object" &&
            value !== null &&
            "kind" in value &&
            value.kind === "committed",
        ),
      ).toHaveLength(1);

      expect(
        values.filter(
          (value) =>
            typeof value === "object" &&
            value !== null &&
            "kind" in value &&
            value.kind === "head-moved",
        ),
      ).toHaveLength(1);
    } finally {
      await Promise.all(workers.map((worker) => worker.terminate()));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("startup repairs existing directory, database and sidecar modes", () => {
  const dir = temp();

  try {
    const first = createSqliteStorageAdapter(dir, 0);
    first.close();
    writeFileSync(join(dir, "identity.json"), "{}");
    chmodSync(dir, 0o755);
    chmodSync(join(dir, "envden.sqlite"), 0o644);
    chmodSync(join(dir, "identity.json"), 0o644);
    const reopened = createSqliteStorageAdapter(dir, 0);
    if (process.platform !== "win32") expect(statSync(dir).mode & 0o777).toBe(0o700);

    for (const name of ["identity.json", "envden.sqlite", "envden.sqlite-wal", "envden.sqlite-shm"])
      if (process.platform !== "win32") expect(statSync(join(dir, name)).mode & 0o777).toBe(0o600);

    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("discard commits durable blob garbage and pruning retries failed deletion", () => {
  const dir = temp();
  const storage = createSqliteStorageAdapter(dir, 0);
  const vault = new Uint8Array([1]);
  const hash = new Uint8Array([2]);
  const path = join(dir, "blobs", "01", "02");

  try {
    storage.configureVault(vault, {
      active: false,
      frozen: false,
      skRefused: false,
      unlockPeriod: null,
    });

    storage.putBlob(vault, hash, new Uint8Array([3]));
    rmSync(path);
    mkdirSync(path);
    storage.transaction(() => storage.discardInactiveVault(vault));
    expect(storage.hasVault(vault)).toBe(false);
    const db = new Database(join(dir, "envden.sqlite"));

    expect(
      db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM blob_garbage").get()?.count,
    ).toBe(1);

    rmSync(path, { recursive: true });
    writeFileSync(path, new Uint8Array([3]));
    storage.prune(vault, { maxAge: 0, minVersions: 1 }, 0);
    expect(existsSync(path)).toBe(false);

    expect(
      db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM blob_garbage").get()?.count,
    ).toBe(0);

    db.close();

    storage.configureVault(vault, {
      active: false,
      frozen: false,
      skRefused: false,
      unlockPeriod: null,
    });

    storage.putBlob(vault, hash, new Uint8Array([3]));
    storage.discardInactiveVault(vault);
    expect(existsSync(path)).toBe(false);
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
