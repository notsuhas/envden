import { unlinkSync } from "node:fs";
import { join } from "node:path";
import type { TContext } from "../db/context.ts";
import { hex } from "../db/values.ts";

export function collectGarbage(context: TContext): void {
  const { db, bytes, run, dataDir } = context;
  if (db.inTransaction) return;

  db.transaction(() => {
    const garbage = db
      .query<{ vault: Uint8Array; hash: Uint8Array }, []>("SELECT vault,hash FROM blob_garbage")
      .all();

    for (const { vault, hash } of garbage) {
      if (!bytes("SELECT hash AS bytes FROM blobs WHERE vault=? AND hash=?", vault, hash)) {
        try {
          unlinkSync(join(dataDir, "blobs", hex(vault) || "empty", hex(hash) || "empty"));
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) continue;
        }
      }

      run("DELETE FROM blob_garbage WHERE vault=? AND hash=?", vault, hash);
    }
  }).immediate();
}
