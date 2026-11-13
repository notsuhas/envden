import type { TRateBucket, TRateCharge } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";
import { hex } from "../db/values.ts";
import { randomUUID } from "node:crypto";

export function createRateLimits(context: TContext) {
  const { db, run } = context;

  function charge(vault: Uint8Array, bucket: TRateBucket, now: number): TRateCharge {
    const key = bucket.kind === "member" ? `member:${hex(bucket.device)}` : `vault:${hex(vault)}`;

    return db
      .transaction(() => {
        const row = db
          .query<{ until: number; strikes: number }, [string]>("SELECT * FROM buckets WHERE key=?")
          .get(key);

        if (row && now < row.until) return { kind: "locked", until: row.until } as const;
        run("DELETE FROM charges WHERE bucket=? AND at<=?", key, now - 900000);
        const receipt = randomUUID();
        run("INSERT INTO charges VALUES(?,?,?)", receipt, key, now);

        const count =
          db
            .query<{ count: number }, [string]>(
              "SELECT COUNT(*) AS count FROM charges WHERE bucket=?",
            )
            .get(key)?.count ?? 0;

        if (count >= 5) {
          const strikes = (row?.strikes ?? 0) + 1;

          run(
            "INSERT OR REPLACE INTO buckets VALUES(?,?,?)",
            key,
            now + Math.min(86400000, 900000 * 2 ** Math.min(strikes - 1, 7)),
            strikes,
          );
        }

        return { kind: "charged", receipt } as const;
      })
      .immediate();
  }

  function refund(receipt: string, now: number): boolean {
    return db
      .transaction(() => {
        const row = db
          .query<{ bucket: string }, [string, number]>(
            "DELETE FROM charges WHERE receipt=? AND at>? RETURNING bucket",
          )
          .get(receipt, now - 900000);

        if (!row) return false;
        run("UPDATE buckets SET until=0 WHERE key=?", row.bucket);

        return true;
      })
      .immediate();
  }

  return { charge, refund };
}
