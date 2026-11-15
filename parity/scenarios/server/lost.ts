import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { setup, password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "server-repair-lost",
  roles: ["server", "device-a"],
  async run(c) {
    const { server } = await setup(c);
    const backup = join(c.root, "backup");
    await server.stop();
    await cp(server.data, backup, { recursive: true });
    const live = await c.server("server", false, server.data, new URL(server.url).port);
    await Bun.write(join(c.get("device-a").checkout, ".env"), "TOKEN=lost-version\n");
    await c.run("device-a", ["push", "--yes"]);
    await live.stop();
    await rm(server.data, { recursive: true });
    await cp(backup, server.data, { recursive: true });
    await rm(join(c.get("device-a").env.ENVDEN_HOME!, "state", "blobs"), { recursive: true });
    const restored = await c.server("server", true, server.data, new URL(server.url).port);
    await c.run("device-a", ["server", "repair"], 0, `${restored.token}\n`);

    for (const [accept, flags, expected] of [
      [false, [], "No device has the newest version"],
      [true, ["--accept-lost"], "recovered from"],
    ] satisfies [boolean, string[], string][]) {
      const t = c.pty("device-a", ["server", "repair", "--finish", ...flags]);

      await t.expect("Repair token", `${restored.token}\r`);
      await t.expect("Master password", `${password}\r`);
      const result = await t.finish();
      c.record(`finish repair accept-lost=${accept}`, result, 0);

      if (!result.stdout.includes(expected)) throw new Error("Missing lost-blob outcome");
    }

    await c.run("device-a", ["status", "--json"]);
  },
} satisfies IScenario;
