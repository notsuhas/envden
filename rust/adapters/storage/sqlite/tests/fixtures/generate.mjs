// fallow-ignore-file unused-file -- Invoked by the Rust SQLite parity tests through Bun.
// oxlint-disable-next-line no-restricted-imports -- Cross-language tests load the frozen reference without workspace installation.
import { createSqliteStorageAdapter } from "../../../../../../packages/adapters/storage/sqlite/src/index.ts";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "envden-schema-"));

try {
  const storage = createSqliteStorageAdapter(dir, 0);
  const db = new Database(join(dir, "envden.sqlite"));
  const schema = db.query("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY name").all();
  writeFileSync(new URL("schema.json", import.meta.url), JSON.stringify(schema, null, 2) + "\n");
  db.close();
  storage.close();
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const schemaSource = new URL(
  "../../../../../../packages/adapters/storage/sqlite/src/db/schema.ts",
  import.meta.url,
);

const { openDatabase } = await import(schemaSource.href);
const pragmaDir = mkdtempSync(join(tmpdir(), "envden-pragmas-"));

try {
  const db = openDatabase(pragmaDir, 0);
  const pragmas = {};
  for (const name of [
    "journal_mode",
    "synchronous",
    "foreign_keys",
    "user_version",
    "busy_timeout",
    "page_size",
    "auto_vacuum",
    "encoding",
    "wal_autocheckpoint",
    "journal_size_limit",
    "locking_mode",
    "secure_delete",
    "temp_store",
  ]) {
    pragmas[name] = Object.values(db.query(`PRAGMA ${name}`).get())[0];
  }
  writeFileSync(new URL("pragmas.json", import.meta.url), JSON.stringify(pragmas, null, 2) + "\n");
  db.close();
} finally {
  rmSync(pragmaDir, { recursive: true, force: true });
}
