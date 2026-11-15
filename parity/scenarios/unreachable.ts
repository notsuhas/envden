import { setup } from "../harness/onboarding.ts";
import type { IScenario } from "../harness/types.ts";

export default {
  name: "unreachable",
  roles: ["server", "device-a"],
  async run(c) {
    const { server } = await setup(c);
    await server.stop();
    await c.run("device-a", ["push", "--yes"], 1);
    await c.run("device-a", ["pull", "--yes"], 1);
    await c.run("device-a", ["status", "--json"]);
  },
} satisfies IScenario;
