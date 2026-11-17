import { Database } from "bun:sqlite";
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Collection runs after shutdown; recover a private copy without writing to retained evidence.
export function readDatabase<T>(path: string, read: (db: Database) => T): T {
  const directory = mkdtempSync(join(tmpdir(), "envden-parity-sqlite-"));
  const copy = join(directory, "evidence.sqlite");
  let db: Database | undefined;

  try {
    copyFileSync(path, copy);
    chmodSync(copy, 0o600);

    for (const suffix of ["-wal", "-journal"]) {
      try {
        copyFileSync(`${path}${suffix}`, `${copy}${suffix}`);
        chmodSync(`${copy}${suffix}`, 0o600);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }

    db = new Database(copy, { readwrite: true, safeIntegers: true });

    return read(db);
  } finally {
    try {
      db?.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
