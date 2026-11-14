import { Database, type SQLQueryBindings } from "bun:sqlite";
import { cp, readdir, rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function snapshotFixture(root: string) {
  const directory = await mkdtemp(join(tmpdir(), "envden-snapshot-"));
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

  for (const name of await readdir(root))
    if (name !== "server") await cp(join(root, name), join(directory, name), { recursive: true });

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

      for (const name of await readdir(root))
        if (name !== "server") await rm(join(root, name), { recursive: true, force: true });

      for (const name of await readdir(directory))
        await cp(join(directory, name), join(root, name), { recursive: true });
    },
    async cleanup() {
      database.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
