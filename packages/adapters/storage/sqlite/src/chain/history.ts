import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { IHistoryPolicy } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";
import { hex } from "../db/values.ts";

export function createHistory(context: TContext) {
  const { db, bytes, run, dataDir } = context;

  function prune(vault: Uint8Array, policy: IHistoryPolicy, now: number) {
    if (
      !Number.isFinite(policy.maxAge) ||
      policy.maxAge < 0 ||
      !Number.isInteger(policy.minVersions) ||
      policy.minVersions < 1
    )
      throw new Error("Invalid history policy");

    if (db.inTransaction) throw new Error("Pruning must run outside an application transaction");
    const garbage: Uint8Array[] = [];

    const result = db
      .transaction(() => {
        const candidates = db
          .query<{ hash: Uint8Array }, [Uint8Array]>(
            "SELECT DISTINCT blob AS hash FROM versions WHERE vault=? AND blob IS NOT NULL",
          )
          .all(vault);

        candidates.push(
          ...db
            .query<{ hash: Uint8Array }, [Uint8Array, number]>(
              "SELECT hash FROM blob_usage WHERE vault=? AND at<? AND hash NOT IN (SELECT blob FROM versions WHERE vault=blob_usage.vault AND blob IS NOT NULL)",
            )
            .all(vault, now - 86400000),
        );

        const removed = db
          .query<
            { hash: Uint8Array },
            [Uint8Array, number, Uint8Array, Uint8Array, Uint8Array, number]
          >(`DELETE FROM lists WHERE vault=? AND at<? AND permanent=0
        AND hash NOT IN (SELECT files FROM headers WHERE vault=? ORDER BY seq DESC LIMIT 1)
        AND hash NOT IN (SELECT MIN(list) FROM versions WHERE vault=? AND (tombstone=1 OR (file,version) IN (
          SELECT file,version FROM (SELECT DISTINCT file,version,DENSE_RANK() OVER (PARTITION BY file ORDER BY version DESC) AS rank FROM versions WHERE vault=?) WHERE rank<=?)) GROUP BY file,version) RETURNING hash`)
          .all(vault, now - policy.maxAge, vault, vault, vault, policy.minVersions);

        let blobs = 0;

        for (const candidate of candidates) {
          if (
            bytes(
              "SELECT blob AS bytes FROM versions WHERE vault=? AND blob=? LIMIT 1",
              vault,
              candidate.hash,
            )
          )
            continue;

          run("DELETE FROM blob_usage WHERE vault=? AND hash=?", vault, candidate.hash);
          garbage.push(candidate.hash);
          blobs += run("DELETE FROM blobs WHERE vault=? AND hash=?", vault, candidate.hash);
        }

        return { lists: removed.length, blobs };
      })
      .immediate();

    db.transaction(() => {
      for (const hash of garbage) {
        if (bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", vault, hash))
          continue;

        const path = join(dataDir, "blobs", hex(vault) || "empty", hex(hash) || "empty");
        if (existsSync(path)) unlinkSync(path);
      }
    }).immediate();

    return result;
  }

  return { prune };
}
