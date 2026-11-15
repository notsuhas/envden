import { Database } from "bun:sqlite";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { IScenario } from "../types.ts";
import { cli } from "../sync.ts";

export const probe: IScenario = {
  name: "channel-probe",
  steps: [
    {
      name: "prepare literal evidence",
      run: async (c) => {
        const d = await c.device("a");
        await writeFile(join(d.home, "evidence.txt"), "literal evidence\n", { mode: 0o600 });
        const db = new Database(join(d.home, "evidence.sqlite"));
        db.run("CREATE TABLE evidence (id INTEGER PRIMARY KEY, value TEXT)");
        db.run("INSERT INTO evidence VALUES (1, 'literal evidence')");
        db.close();
      },
    },
    cli("a", ["version"]),
  ],
};
