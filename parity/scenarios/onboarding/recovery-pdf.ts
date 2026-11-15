import { join } from "node:path";
import { setup, recoveryJoin, password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "recovery-pdf",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const { server, kit } = await setup(c);
    await recoveryJoin(c, server.url, kit);

    const remove = c.pty("device-a", [
      "device",
      "rm",
      "beta",
      "--new-kit",
      "--kit-out",
      join(c.get("device-a").home, "removal-kit.json"),
    ]);

    await remove.expect("Master password", `${password}\r`);
    await remove.expect("Remove this device?", "y");
    await c.finish("device-a", "remove with replacement kit", remove);
    const replacement = c.pty("device-a", ["vault", "kit", "replace"]);
    await replacement.expect("Master password", `${password}\r`);
    await replacement.expect("Open it now?", "n");
    await c.finish("device-a", "replacement PDF", replacement);
    await c.run("device-a", ["device", "ls", "--json"]);
  },
} satisfies IScenario;
