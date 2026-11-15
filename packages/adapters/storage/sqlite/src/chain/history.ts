import { collectGarbage } from "../blobs/garbage.ts";
import type { IHistoryPolicy } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";
import { hex } from "../db/values.ts";

// Blobs follow file versions, not lists: a list kept for one file's version keeps no other blob.
const RANKED = `WITH ranked AS (SELECT file,version FROM (SELECT DISTINCT file,version,
  DENSE_RANK() OVER (PARTITION BY file ORDER BY version DESC) AS rank FROM versions WHERE vault=?1) WHERE rank<=?3)`;

export function createHistory(context: TContext) {
  const { db, run } = context;

  function prune(vault: Uint8Array, policy: IHistoryPolicy, now: number) {
    if (
      !Number.isFinite(policy.maxAge) ||
      policy.maxAge < 0 ||
      !Number.isInteger(policy.minVersions) ||
      policy.minVersions < 1
    )
      throw new Error("Invalid history policy");

    if (db.inTransaction) throw new Error("Pruning must run outside an application transaction");

    context.maintain(now);

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

        const cutoff = now - policy.maxAge;

        const removed = db
          .query<{ hash: Uint8Array }, [Uint8Array, number, number]>(
            `${RANKED} DELETE FROM lists WHERE vault=?1 AND at<?2 AND permanent=0
        AND hash NOT IN (SELECT files FROM headers WHERE vault=?1 ORDER BY seq DESC LIMIT 1)
        AND hash NOT IN (SELECT MIN(list) FROM versions WHERE vault=?1 AND (file,version) IN ranked GROUP BY file,version) RETURNING hash`,
          )
          .all(vault, cutoff, policy.minVersions);

        const retained = new Set(
          db
            .query<{ hash: Uint8Array }, [Uint8Array, number, number]>(
              `${RANKED} SELECT DISTINCT v.blob AS hash FROM versions v JOIN lists l ON l.vault=v.vault AND l.hash=v.list
            WHERE v.vault=?1 AND v.blob IS NOT NULL AND (l.at>=?2 OR (v.file,v.version) IN ranked)`,
            )
            .all(vault, cutoff, policy.minVersions)
            .map((row) => hex(row.hash)),
        );

        let blobs = 0;

        for (const candidate of candidates) {
          if (retained.has(hex(candidate.hash))) continue;

          run("DELETE FROM blob_usage WHERE vault=? AND hash=?", vault, candidate.hash);
          run("INSERT OR IGNORE INTO blob_garbage VALUES(?,?)", vault, candidate.hash);
          blobs += run("DELETE FROM blobs WHERE vault=? AND hash=?", vault, candidate.hash);
        }

        return { lists: removed.length, blobs };
      })
      .immediate();

    collectGarbage(context);

    return result;
  }

  return { prune };
}
