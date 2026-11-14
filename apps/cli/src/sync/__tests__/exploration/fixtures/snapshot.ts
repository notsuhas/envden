import { Database, type SQLQueryBindings } from "bun:sqlite";
import { join } from "node:path";
import { snapshotTree } from "./tree.ts";

export async function snapshotFixture(root: string) {
  const restoreTree = await snapshotTree(root);
  const database = new Database(join(root, "server", "envden.sqlite"));

  const tables = database
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all();

  const rows = tables.map(({ name }) => ({
    name,
    values: database.query<Record<string, SQLQueryBindings>, []>(`SELECT * FROM "${name}"`).all(),
  }));

  return {
    async restore() {
      database.run("PRAGMA foreign_keys=OFF");

      database.transaction(() => {
        for (const { name } of rows) database.run(`DELETE FROM "${name}"`);

        for (const { name, values } of rows) {
          for (const row of values) {
            const columns = Object.keys(row)
              .map((column) => `"${column}"`)
              .join(",");

            database
              .query(
                `INSERT INTO "${name}" (${columns}) VALUES (${Object.keys(row)
                  .map(() => "?")
                  .join(",")})`,
              )
              .run(...Object.values(row));
          }
        }
      })();

      await restoreTree();
    },
    cleanup() {
      database.close();
    },
  };
}
