import { Database } from "bun:sqlite";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cli } from "../steps/cli.ts";
import type { IScenario } from "../types.ts";

export const probe: IScenario = {
  name: "channel-probe",
  roles: ["a"],
  steps: [
    {
      name: "prepare literal evidence",
      run: async (c) => {
        const d = await c.device("a");
        const db = new Database(join(d.home, "evidence.sqlite"));

        await writeFile(join(d.home, "evidence.txt"), "literal evidence\n", { mode: 0o600 });
        db.run("CREATE TABLE evidence (id INTEGER PRIMARY KEY, value TEXT)");
        db.run("INSERT INTO evidence VALUES (1, 'literal evidence')");
        db.close();
      },
    },
    cli("a", ["version"]),
  ],
};
