import { Database } from "bun:sqlite";
import type { IRetained } from "./objects.ts";

export function database(path: string, objects: IRetained[]): void {
  const db = new Database(path, { readonly: true });

  try {
    const tables = new Set(
      db
        .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );

    for (const [table, kind] of [
      ["entries", "entry"],
      ["headers", "manifest"],
      ["lists", "files"],
    ] as const) {
      if (!tables.has(table)) continue;

      const rows = db
        .query<{ hash: Uint8Array; bytes: Uint8Array }, []>(`SELECT hash, bytes FROM ${table}`)
        .all();

      for (const [i, row] of rows.entries())
        objects.push({ path: `${path}/${table}/${i}`, kind, ...row });
    }

    if (tables.has("state")) stateRows(db, path, objects);
  } finally {
    db.close();
  }
}

function stateRows(db: Database, path: string, objects: IRetained[]): void {
  const rows = db
    .query<{ kind: string; key: Uint8Array; bytes: Uint8Array }, []>(
      "SELECT kind, key, bytes FROM state",
    )
    .all();

  for (const [i, row] of rows.entries()) {
    if (row.kind === "keyring" || row.kind === "envelope")
      objects.push({
        path: `${path}/state/${i}`,
        kind: row.kind,
        bytes: row.bytes,
        ...(row.kind === "keyring" ? { hash: row.key } : {}),
      });
  }
}
