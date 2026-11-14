import type { SQLQueryBindings } from "bun:sqlite";
import { openDatabase, pruneBackups } from "./schema.ts";

export type TContext = ReturnType<typeof createContext>;

export function createContext(dataDir: string, now: number) {
  const db = openDatabase(dataDir, now);

  function bytes(sql: string, ...args: SQLQueryBindings[]): Uint8Array | undefined {
    return (
      db.query<{ bytes: Uint8Array | null }, SQLQueryBindings[]>(sql).get(...args)?.bytes ??
      undefined
    );
  }

  function run(sql: string, ...args: SQLQueryBindings[]): number {
    return db.query(sql).run(...args).changes;
  }

  let maintainedAt = now - 60000;

  function maintain(time: number) {
    if (time - maintainedAt < 60000) return;
    pruneBackups(dataDir, time);

    db.transaction(() => {
      for (const table of ["nonces", "sessions", "approvers"])
        run(`DELETE FROM ${table} WHERE expires<=?`, time);
    }).immediate();

    maintainedAt = time;
  }

  return { db, bytes, run, dataDir, maintain };
}
