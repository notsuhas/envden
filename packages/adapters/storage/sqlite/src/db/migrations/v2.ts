import type { Database } from "bun:sqlite";

export function migrateV2(db: Database): void {
  db.exec(`CREATE INDEX nonces_expires ON nonces(expires);
    CREATE INDEX sessions_expires ON sessions(expires);
    CREATE INDEX approvers_expires ON approvers(expires);
    UPDATE state SET kind='setup-issued',key=x'' WHERE vault=zeroblob(32) AND kind='server-identity' AND key=CAST('setup-issued' AS BLOB);
    DELETE FROM state WHERE vault=zeroblob(32) AND kind='server-identity' AND length(key)=32;
    PRAGMA user_version = 2;`);
}
