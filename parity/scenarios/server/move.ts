import { setup, password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "server-move",
  roles: ["server", "destination", "device-a"],
  async run(c) {
    await setup(c);
    const destination = await c.server("destination");
    const move = c.pty("device-a", ["server", "move", destination.url]);
    await move.expect("Server setup token", `${destination.token}\r`);
    await move.expect("Master password", `${password}\r`);
    await c.finish("device-a", "server move", move);
    await c.run("device-a", ["status", "--json"]);

    for (const flag of ["--resume", "--abort"]) {
      const t = c.pty("device-a", ["server", "move", flag]);
      await t.expect("Master password", `${password}\r`);
      await c.finish("device-a", `server move ${flag}`, t, 0);
    }
  },
} satisfies IScenario;
