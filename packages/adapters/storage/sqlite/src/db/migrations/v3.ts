import type { Database } from "bun:sqlite";

export function migrateV3(db: Database): void {
  db.run(`CREATE INDEX headers_files ON headers(vault,files);
    UPDATE state SET kind='mailbox-joiner' WHERE kind='server-identity' AND length(key)=2;
    PRAGMA user_version = 3;`);
}
