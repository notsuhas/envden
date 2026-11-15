import { EnvdenError } from "@envden/core/errors";
import { restrictAccessSync } from "@envden/core/process";
import { syncDirectory } from "./directory.ts";
import { migrateV1 } from "./migrations/v1.ts";
import { Database } from "bun:sqlite";
import {
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

  restrictAccessSync(dataDir, true);

  restrictFiles(dataDir, [
    "envden.sqlite",
    "envden.sqlite-wal",
    "envden.sqlite-shm",
    "identity.json",
  ]);

  const existed = existsSync(path);
  const db = new Database(path, { create: true, strict: true });

  try {
    db.run(
      "PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;",
    );

    restrictFiles(dataDir, ["envden.sqlite", "envden.sqlite-wal", "envden.sqlite-shm"]);

    migrateDatabase(db, dataDir, existed);

    pruneBackups(dataDir, now);

    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// a Windows ACL inherited from the parent may let other users read the vault data
function restrictFiles(dataDir: string, names: string[]) {
  for (const name of names)
    if (existsSync(join(dataDir, name))) restrictAccessSync(join(dataDir, name), false);
}

function migrateDatabase(db: Database, dataDir: string, existed: boolean) {
  db.transaction(() => {
    const version =
      db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0;

    if (version !== 0 && version !== 1)
      throw new EnvdenError("INVALID_INPUT", "Incompatible server database format");

    if (version === 1) return;

    if (existed) backupDatabase(db, dataDir, version);

    if (version === 0) migrateV1(db);
  }).immediate();
}

function backupDatabase(db: Database, dataDir: string, version: number) {
  const backup = join(dataDir, `pre-${version + 1}`);
  const fd = openSync(backup, "w", 0o600);

  try {
    writeFileSync(fd, db.serialize());
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  syncDirectory(dataDir);
}

export function pruneBackups(dataDir: string, now: number) {
  for (const name of readdirSync(dataDir)) {
    if (/^pre-\d+$/.test(name) && now - statSync(join(dataDir, name)).mtimeMs >= 30 * 86400000)
      rmSync(join(dataDir, name));
  }
}
