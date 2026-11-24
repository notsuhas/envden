import type { Database } from "bun:sqlite";

export function migrateV2(db: Database): void {
  db.run(`
          CREATE TABLE vaults (id BLOB PRIMARY KEY, head BLOB, active INTEGER NOT NULL, frozen INTEGER NOT NULL, moved BLOB, refused INTEGER NOT NULL, repair BLOB, restored BLOB, progress BLOB);
          CREATE TABLE headers (vault BLOB NOT NULL REFERENCES vaults(id), seq TEXT NOT NULL, hash BLOB NOT NULL, bytes BLOB NOT NULL, at REAL NOT NULL, files BLOB, PRIMARY KEY(vault,seq), UNIQUE(vault,hash));
          CREATE TABLE entries (vault BLOB NOT NULL REFERENCES vaults(id), seq TEXT NOT NULL, hash BLOB NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(vault,seq), UNIQUE(vault,hash));
          CREATE TABLE lists (vault BLOB NOT NULL REFERENCES vaults(id), hash BLOB NOT NULL, bytes BLOB NOT NULL, at REAL NOT NULL, permanent INTEGER NOT NULL, PRIMARY KEY(vault,hash));
          CREATE TABLE versions (vault BLOB NOT NULL, list BLOB NOT NULL, file BLOB NOT NULL, version TEXT NOT NULL, blob BLOB, tombstone INTEGER NOT NULL, PRIMARY KEY(vault,list,file), FOREIGN KEY(vault,list) REFERENCES lists(vault,hash) ON DELETE CASCADE);
          CREATE TABLE state (vault BLOB NOT NULL, kind TEXT NOT NULL, key BLOB NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(vault,kind,key));
          CREATE TABLE devices (vault BLOB NOT NULL REFERENCES vaults(id), id BLOB NOT NULL, version TEXT NOT NULL, PRIMARY KEY(vault,id));
          CREATE TABLE digests (vault BLOB NOT NULL REFERENCES vaults(id), digest BLOB NOT NULL, PRIMARY KEY(vault,digest));
          CREATE TABLE blobs (vault BLOB NOT NULL, hash BLOB NOT NULL, PRIMARY KEY(vault,hash));
          CREATE TABLE setup (singleton INTEGER PRIMARY KEY CHECK(singleton=1), bytes BLOB NOT NULL);
          CREATE TABLE sessions (vault BLOB NOT NULL, kind TEXT NOT NULL, device BLOB NOT NULL, purpose TEXT NOT NULL, bytes BLOB NOT NULL, expires REAL NOT NULL, PRIMARY KEY(vault,kind,device,purpose));
          CREATE TABLE approvers (vault BLOB NOT NULL, device BLOB NOT NULL, bytes BLOB NOT NULL, expires REAL NOT NULL, PRIMARY KEY(vault,device));
          CREATE TABLE buckets (key TEXT PRIMARY KEY, until REAL NOT NULL, strikes INTEGER NOT NULL);
          CREATE TABLE charges (receipt TEXT PRIMARY KEY, bucket TEXT NOT NULL, at REAL NOT NULL);
          CREATE TABLE join_requests (number INTEGER PRIMARY KEY, joiner BLOB NOT NULL, record BLOB NOT NULL, commitment BLOB NOT NULL, expires REAL NOT NULL, claim_vault BLOB, claim_device BLOB);
          CREATE TABLE join_slots (number INTEGER NOT NULL REFERENCES join_requests(number) ON DELETE CASCADE, slot TEXT NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(number,slot));
          CREATE TABLE join_openings (at REAL NOT NULL);
          CREATE TABLE nonces (device BLOB NOT NULL, nonce BLOB NOT NULL, expires REAL NOT NULL, PRIMARY KEY(device,nonce));
          CREATE INDEX nonces_expires ON nonces(expires);
          CREATE INDEX sessions_expires ON sessions(expires);
          CREATE INDEX approvers_expires ON approvers(expires);
          CREATE INDEX headers_files ON headers(vault,files);
          CREATE INDEX charges_at ON charges(at);
          CREATE INDEX charges_bucket ON charges(bucket);
          CREATE INDEX buckets_until ON buckets(until);
          CREATE TABLE blob_usage (vault BLOB NOT NULL, hash BLOB NOT NULL, size INTEGER NOT NULL, at REAL NOT NULL, PRIMARY KEY(vault,hash));
          CREATE TABLE blob_garbage (vault BLOB NOT NULL, hash BLOB NOT NULL, PRIMARY KEY(vault,hash));
          PRAGMA user_version = 2;
        `);
}
