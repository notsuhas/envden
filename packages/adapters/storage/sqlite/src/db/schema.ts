import { migrateV1 } from "./migrations/v1.ts";
import { Database } from "bun:sqlite";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  openSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

export function openDatabase(dataDir: string, now: number): Database {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, "envden.sqlite");

  if (process.platform !== "win32") {
    chmodSync(dataDir, 0o700);

    for (const name of ["envden.sqlite", "envden.sqlite-wal", "envden.sqlite-shm", "identity.json"])
      if (existsSync(join(dataDir, name))) chmodSync(join(dataDir, name), 0o600);
  }

  const existed = existsSync(path);
  const db = new Database(path, { create: true, strict: true });

  try {
    db.exec(
      "PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
    );

    if (process.platform !== "win32")
      for (const name of ["envden.sqlite", "envden.sqlite-wal", "envden.sqlite-shm"])
        if (existsSync(join(dataDir, name))) chmodSync(join(dataDir, name), 0o600);

    migrateDatabase(db, dataDir, existed);

    db.exec(
      "CREATE TABLE IF NOT EXISTS blob_usage (vault BLOB NOT NULL, hash BLOB NOT NULL, size INTEGER NOT NULL, at REAL NOT NULL, PRIMARY KEY(vault,hash))",
    );

    db.exec(
      "CREATE TABLE IF NOT EXISTS blob_garbage (vault BLOB NOT NULL, hash BLOB NOT NULL, PRIMARY KEY(vault,hash))",
    );

    pruneBackups(dataDir, now);

    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function migrateDatabase(db: Database, dataDir: string, existed: boolean) {
  db.transaction(() => {
    const version =
      db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;

    if (version > 1)
      throw new Error(
        `Database schema ${version} is newer than supported schema 1; update envden.`,
      );

    if (version === 1) return;

    if (existed) {
      const backup = join(dataDir, "pre-1");
      const fd = openSync(backup, "wx", 0o600);

      try {
        writeFileSync(fd, db.serialize());
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }

      const dirFd = openSync(dataDir, "r");

      try {
        fsyncSync(dirFd);
      } finally {
        closeSync(dirFd);
      }
    }

    migrateV1(db);
  }).immediate();
}

function pruneBackups(dataDir: string, now: number) {
  for (const name of readdirSync(dataDir)) {
    if (/^pre-\d+$/.test(name) && now - statSync(join(dataDir, name)).mtimeMs >= 30 * 86400000)
      rmSync(join(dataDir, name));
  }
}
