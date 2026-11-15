import { startRepair } from "../../harness/server/repair.ts";
import { setup, recoveryJoin, password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "server-repair-without",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const { server, kit } = await setup(c);
    await recoveryJoin(c, server.url, kit);
    const restored = await startRepair(c, server);

    const finish = c.pty("device-a", [
      "server",
      "repair",
      "--finish",
      "--without",
      "beta",
      "--accept-lost",
    ]);

    await finish.expect("Repair token", `${restored.token}\r`);
    await finish.expect("Master password", `${password}\r`);
    await c.finish("device-a", "repair without beta", finish);
    await c.run("device-a", ["device", "ls", "--json"]);
    await c.run("device-b", ["push", "--yes"], 1);
  },
} satisfies IScenario;
