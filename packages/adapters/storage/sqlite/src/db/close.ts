import type { Database } from "bun:sqlite";

// A truncating checkpoint before the last close leaves only envden.sqlite behind.
export function closeDatabase(db: Database) {
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
}
