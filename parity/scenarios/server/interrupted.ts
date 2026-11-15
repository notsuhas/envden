import { setup, recoveryJoin, password } from "../../harness/onboarding.ts";
import { proxy } from "../../harness/server/proxy.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "server-move-interrupted",
  roles: ["server", "destination", "next", "device-a", "device-b"],
  async run(c) {
    const source = await c.server();
    const from = proxy(source.url);
    let destination = await c.server("destination");
    let to = proxy(destination.url);

    try {
      const { kit } = await setup(c, { ...source, url: from.url });
      await recoveryJoin(c, from.url, kit);

      const move = async (args: string[], code = 0) => {
        const t = c.pty("device-a", ["server", "move", ...args]);

        if (!args[0]?.startsWith("--") && !args.includes("--setup-token"))
          await t.expect("Server setup token", `${destination.token}\r`);

        await t.expect("Master password", `${password}\r`);
        await c.finish("device-a", `interrupted move ${args.join(" ")}`, t, code);
      };

      from.block();
      await move([to.url], 1);
      if (!from.hits()) throw new Error("Source commit fault was not reached");
      from.unblock();
      await move(["--abort"]);
      await c.run("device-a", ["status", "--json"]);
      await destination.stop();
      await to.close();
      destination = await c.server("next");
      to = proxy(destination.url);
      to.block();
      await move([to.url, "--setup-token", destination.token], 1);
      if (!to.hits()) throw new Error("Destination commit fault was not reached");
      await move(["--abort"], 1);
      to.unblock();
      await move(["--resume"]);
      await source.stop();
      await c.run("device-b", ["server", "switch", to.url], 1);
      await c.run("device-a", ["server", "switch", to.url]);
      await c.run("device-a", ["status", "--json"]);
    } finally {
      await from.close();
      await to.close();
    }
  },
} satisfies IScenario;
