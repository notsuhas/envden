import type { TStateKind, IStateWrite } from "@envden/core/adapters";
import type { TContext } from "../db/context.ts";

export function createState(context: TContext) {
  const { db, bytes, run } = context;

  function state(vault: Uint8Array, kind: TStateKind, key: Uint8Array): Uint8Array | undefined {
    return bytes("SELECT bytes FROM state WHERE vault=? AND kind=? AND key=?", vault, kind, key);
  }

  function states(vault: Uint8Array, kind: TStateKind) {
    return db
      .query<{ key: Uint8Array; bytes: Uint8Array }, [Uint8Array, string]>(
        "SELECT key,bytes FROM state WHERE vault=? AND kind=? ORDER BY key",
      )
      .all(vault, kind);
  }

  function writeState(vault: Uint8Array, writes: IStateWrite[]): void {
    db.transaction(() => {
      for (const write of writes) {
        if (write.bytes === undefined)
          run("DELETE FROM state WHERE vault=? AND kind=? AND key=?", vault, write.kind, write.key);
        else
          run(
            "INSERT OR REPLACE INTO state VALUES(?,?,?,?)",
            vault,
            write.kind,
            write.key,
            write.bytes,
          );
      }
    }).immediate();
  }

  return { state, states, writeState };
}
