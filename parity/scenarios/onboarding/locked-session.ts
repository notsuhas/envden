import { setup, password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "locked-session",
  roles: ["server", "device-a"],
  async run(c) {
    await setup(c);
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
    await c.run("device-a", ["push", "--all", "--yes", "--json"]);
  },
} satisfies IScenario;
