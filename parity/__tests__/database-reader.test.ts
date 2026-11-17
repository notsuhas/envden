import { constants, Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Normalizer } from "../normalize/normalizer.ts";
import { readDatabase } from "../runtime/sqlite/reader.ts";
import { snapshot } from "../runtime/snapshot.ts";

async function evidence(root: string) {
  const files = [];

  for (const name of (await readdir(root)).sort()) {
    const path = join(root, name);
    const bytes = await readFile(path);

    files.push({
      name,
      mode: (await stat(path)).mode,
      hash: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  return files;
}

for (const sidecars of [true, false]) {
  test(`SQLite readers preserve evidence and include latest rows (sidecars=${sidecars})`, async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-database-"));
    const path = join(root, "evidence.sqlite");
    const db = new Database(path);

    try {
      db.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0);
      db.run("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0");
      db.run("CREATE TABLE evidence (value TEXT, number INTEGER)");
      db.run("PRAGMA wal_checkpoint(TRUNCATE)");
      db.run("INSERT INTO evidence VALUES ('wal-only', 9007199254740993)");

      if (!sidecars) {
        db.run("PRAGMA wal_checkpoint(TRUNCATE)");
        db.close();
      }

      const before = await evidence(root);
      expect(before.some((file) => file.name.endsWith("-wal"))).toBe(sidecars);
      expect(before.some((file) => file.name.endsWith("-shm"))).toBe(sidecars);

      expect(readDatabase(path, (copy) => copy.query("SELECT * FROM evidence").all())).toEqual([
        { value: "wal-only", number: 9007199254740993n },
      ]);

      const observation = await snapshot(root, new Normalizer());
      expect(observation["evidence.sqlite:db"]).toContain("wal-only");
      expect(observation["evidence.sqlite:db"]).toContain("9007199254740993");
      expect(await evidence(root)).toEqual(before);
    } finally {
      if (sidecars) db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
