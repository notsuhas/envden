import type { SQLQueryBindings } from "bun:sqlite";
import type { IStoredHeader, IStoredSwap } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";
import { seq } from "../db/values.ts";

interface IChainRow {
  hash: Uint8Array;
  bytes: Uint8Array;
  seq: string;
}

export function createChain(context: TContext) {
  const { db, bytes } = context;

  function chain(
    table: "headers" | "entries",
    vault: Uint8Array,
    from: bigint,
    to: bigint,
    limit = 2147483647,
    maxBytes = Number.MAX_SAFE_INTEGER,
  ): IStoredHeader[] {
    return db
      .query<IChainRow, SQLQueryBindings[]>(
        `SELECT hash,bytes,seq FROM (
          SELECT hash,bytes,seq,SUM(length(bytes)) OVER (ORDER BY seq) AS total,
            ROW_NUMBER() OVER (ORDER BY seq) AS position FROM (
            SELECT hash,bytes,seq FROM ${table} WHERE vault=? AND seq BETWEEN ? AND ? ORDER BY seq LIMIT ?
          )
        ) WHERE total<=? OR position=1 ORDER BY seq`,
      )
      .all(vault, seq(from), seq(to), limit, maxBytes)
      .map((row) => ({ ...row, seq: BigInt(row.seq) }));
  }

  function headers(
    vault: Uint8Array,
    from: bigint,
    to: bigint,
    limit?: number,
    maxBytes?: number,
  ): IStoredHeader[] {
    return chain("headers", vault, from, to, limit, maxBytes);
  }

  function entries(
    vault: Uint8Array,
    from: bigint,
    to: bigint,
    limit?: number,
    maxBytes?: number,
  ): IStoredHeader[] {
    return chain("entries", vault, from, to, limit, maxBytes);
  }

  function header(vault: Uint8Array, hash: Uint8Array): IStoredHeader | undefined {
    const row = db
      .query<IChainRow, [Uint8Array, Uint8Array]>(
        "SELECT hash,bytes,seq FROM headers WHERE vault=? AND hash=?",
      )
      .get(vault, hash);

    return row ? { ...row, seq: BigInt(row.seq) } : undefined;
  }

  function headersForFiles(vault: Uint8Array, hash: Uint8Array): IStoredHeader[] {
    return db
      .query<IChainRow, [Uint8Array, Uint8Array, Uint8Array, Uint8Array]>(`
      SELECT hash,bytes,seq FROM headers WHERE vault=? AND files=?
      UNION
      SELECT n.hash,n.bytes,n.seq FROM headers p JOIN headers n ON n.vault=p.vault
        AND n.seq=(SELECT MIN(seq) FROM headers WHERE vault=p.vault AND seq>p.seq)
        WHERE p.vault=? AND p.files=? ORDER BY seq
    `)
      .all(vault, hash, vault, hash)
      .map((row) => ({ ...row, seq: BigInt(row.seq) }));
  }

  function fileList(vault: Uint8Array, hash: Uint8Array): Uint8Array | undefined {
    return bytes("SELECT bytes FROM lists WHERE vault=? AND hash=?", vault, hash);
  }

  function putFileList(vault: Uint8Array, files: NonNullable<IStoredSwap["files"]>, now: number) {
    db.transaction(() => {
      context.run(
        "INSERT INTO lists VALUES(?,?,?,?,?) ON CONFLICT(vault,hash) DO UPDATE SET at=excluded.at,permanent=MAX(permanent,excluded.permanent)",
        vault,
        files.hash,
        files.bytes,
        now,
        +(files.retainForever ?? false),
      );

      for (const version of files.versions)
        context.run(
          "INSERT OR IGNORE INTO versions VALUES(?,?,?,?,?,?)",
          vault,
          files.hash,
          version.fileId,
          seq(version.version),
          version.blobHash ?? null,
          +version.tombstone,
        );
    }).immediate();
  }

  return { headers, entries, header, headersForFiles, fileList, putFileList };
}
