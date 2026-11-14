import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSqliteStorageAdapter } from "../index.ts";

function temp() {
  return mkdtempSync(join(tmpdir(), "envden-recovery-"));
}

test("startup adopts verified content-addressed files after a database restore", async () => {
  const { H } = await import("@envden/core/protocol");
  const dir = temp();
  const content = new Uint8Array([4, 5, 6]);
  const hash = H("blob", content);
  const path = join(dir, "blobs", "01");
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, Buffer.from(hash).toString("hex")), content);
  const storage = createSqliteStorageAdapter(dir, 0);

  try {
    expect(storage.getBlob(new Uint8Array([1]), hash)).toEqual(content);
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migration replaces an interrupted backup and live requests prune expired secrets", () => {
  const dir = temp();
  const path = join(dir, "envden.sqlite");
  const db = new Database(path);
  db.run("CREATE TABLE fixture(value); INSERT INTO fixture VALUES(42)");
  db.close();
  writeFileSync(join(dir, "pre-1"), "partial");
  const storage = createSqliteStorageAdapter(dir, 0);

  try {
    const backup = new Database(join(dir, "pre-1"));
    expect(backup.query<{ value: number }, []>("SELECT value FROM fixture").get()?.value).toBe(42);
    backup.close();
    utimesSync(join(dir, "pre-1"), 0, 0);
    const key = { kind: "login", device: new Uint8Array([1]), purpose: "unlock" } as const;
    storage.putSession(new Uint8Array([1]), key, new Uint8Array([2]), 0);
    const inspect = new Database(path);
    inspect.run("INSERT INTO approvers VALUES(x'01',x'01',x'02',100)");
    storage.rememberNonce(new Uint8Array([1]), new Uint8Array([2]), 30 * 86400000);
    expect(existsSync(join(dir, "pre-1"))).toBe(false);

    for (const table of ["sessions", "approvers"])
      expect(inspect.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n).toBe(
        0,
      );

    expect(
      inspect
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE name='nonces_expires'")
        .get()?.name,
    ).toBe("nonces_expires");

    inspect.close();
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("startup does not adopt blobs pending deletion after discard", async () => {
  const { H } = await import("@envden/core/protocol");
  const dir = temp();
  const vault = new Uint8Array([1]);
  const content = new Uint8Array([4, 5, 6]);
  const hash = H("blob", content);
  const first = createSqliteStorageAdapter(dir, 0);
  first.putBlob(vault, hash, content);
  first.close();
  const db = new Database(join(dir, "envden.sqlite"));
  db.run("DELETE FROM blobs; DELETE FROM blob_usage");
  db.query("INSERT INTO blob_garbage VALUES(?,?)").run(vault, hash);
  db.close();
  const storage = createSqliteStorageAdapter(dir, 0);

  try {
    expect(storage.getBlob(vault, hash)).toBeUndefined();
    expect(existsSync(join(dir, "blobs", "01", Buffer.from(hash).toString("hex")))).toBe(false);
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("startup preserves a blob re-uploaded after garbage was recorded", async () => {
  const { H } = await import("@envden/core/protocol");
  const dir = temp();
  const vault = new Uint8Array([1]);
  const content = new Uint8Array([4, 5, 6]);
  const hash = H("blob", content);
  const first = createSqliteStorageAdapter(dir, 0);
  first.putBlob(vault, hash, content);
  first.close();
  const db = new Database(join(dir, "envden.sqlite"));
  db.query("INSERT INTO blob_garbage VALUES(?,?)").run(vault, hash);
  db.close();
  const storage = createSqliteStorageAdapter(dir, 0);

  try {
    expect(storage.getBlob(vault, hash)).toEqual(content);
  } finally {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
