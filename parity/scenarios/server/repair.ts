import { startRepair } from "../../harness/server/repair.ts";
import { setup, password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "server-repair",
  roles: ["server", "device-a"],
  async run(c) {
    const { server } = await setup(c);
    const restored = await startRepair(c, server);
    const finish = c.pty("device-a", ["server", "repair", "--finish", "--accept-lost"]);
    await finish.expect("Repair token", `${restored.token}\r`);
    await finish.expect("Master password", `${password}\r`);
    await c.finish("device-a", "repair finish", finish);
    await c.run("device-a", ["status", "--json"]);
  },
} satisfies IScenario;
