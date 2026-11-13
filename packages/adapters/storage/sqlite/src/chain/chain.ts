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
  ): IStoredHeader[] {
    return db
      .query<IChainRow, SQLQueryBindings[]>(
        `SELECT hash,bytes,seq FROM ${table} WHERE vault=? AND seq BETWEEN ? AND ? ORDER BY seq`,
      )
      .all(vault, seq(from), seq(to))
      .map((row) => ({ ...row, seq: BigInt(row.seq) }));
  }

  function headers(vault: Uint8Array, from: bigint, to: bigint): IStoredHeader[] {
    return chain("headers", vault, from, to);
  }

  function entries(vault: Uint8Array, from: bigint, to: bigint): IStoredHeader[] {
    return chain("entries", vault, from, to);
  }

  function header(vault: Uint8Array, hash: Uint8Array): IStoredHeader | undefined {
    const row = db
      .query<IChainRow, [Uint8Array, Uint8Array]>(
        "SELECT hash,bytes,seq FROM headers WHERE vault=? AND hash=?",
      )
      .get(vault, hash);

    return row ? { ...row, seq: BigInt(row.seq) } : undefined;
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

  return { headers, entries, header, fileList, putFileList };
}
