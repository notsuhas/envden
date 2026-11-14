import type { Database } from "bun:sqlite";

export function migrateV4(db: Database): void {
  db.run(`CREATE INDEX charges_at ON charges(at);
    CREATE INDEX charges_bucket ON charges(bucket);
    CREATE INDEX buckets_until ON buckets(until);
    PRAGMA user_version = 4;`);
}
