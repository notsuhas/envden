import { Database } from "bun:sqlite";
import { join } from "node:path";
import { setup, password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "locked-session",
  roles: ["server", "device-a"],
  async run(c) {
    await setup(c);
    const database = join(c.servers[0]!.data, "envden.sqlite");
    const period = c.pty("device-a", ["config", "unlock-period", "1d"]);
    await period.expect("Master password", `${password}\r`);
    await c.finish("device-a", "shortest unlock period", period);
    await c.run("device-a", ["config", "unlock-period"]);
    const wrong = c.pty("device-a", ["unlock"]);
    await wrong.expect("Master password", "wrong\r");
    await wrong.expect(/◆  Wrong master password\. Try again/, "wrong\r");
    await wrong.expect(/◆  Wrong master password\. Try again/, "wrong\r");
    await c.finish("device-a", "unlock exhausted retries", wrong, 1);
    const unlock = c.pty("device-a", ["unlock"]);
    await unlock.expect("Master password", `${password}\r`);
    await c.finish("device-a", "unlock after failures", unlock);

    for (const command of ["push", "pull"]) {
      const db = new Database(database);
      db.run("UPDATE devices SET unlocked=0, fresh=0");
      db.close();
      const sync = c.pty("device-a", [command, "--all", "--yes", "--json"]);
      await sync.expect("Master password", `${password}\r`);
      await c.finish("device-a", `${command} unlock and retry`, sync);
    }
  },
} satisfies IScenario;
