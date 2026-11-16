import { join } from "node:path";
import { realpath, writeFile, unlink } from "node:fs/promises";
import { setup, recoveryJoin } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "resolution-options",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const { server, kit } = await setup(c);
    await recoveryJoin(c, server.url, kit);

    const repo = await realpath(c.get("device-b").checkout);

    for (const choice of ["--keep-mine", "--take-server"]) {
      await writeFile(join(c.get("device-a").checkout, ".env"), `TOKEN=alpha-${choice}\n`);
      await writeFile(join(c.get("device-b").checkout, ".env"), `TOKEN=beta-${choice}\n`);
      await c.run("device-a", ["push", "--yes"]);
      await c.run("device-b", ["pull", "--yes"], 3);
      const listed = await c.run("device-b", ["resolve", "--list", "--json"]);
      const file = JSON.parse(listed.stdout)[0].file;

      await c.run("device-b", ["resolve", file, "--repo", repo, choice, "--json"], 2);

      await c.finish(
        "device-b",
        `resolve ${choice}`,
        c.pty("device-b", ["resolve", file, "--repo", repo, choice, "--json"]),
      );

      await c.run("device-b", ["push", "--yes"]);
      await c.run("device-a", ["pull", "--yes"]);
    }

    const checkout = c.get("device-b").checkout;
    await writeFile(join(checkout, ".env"), "TOKEN=store-edit\n");
    await unlink(join(checkout, ".env"));
    await writeFile(join(checkout, ".env"), "TOKEN=detached-edit\n");
    const detached = c.pty("device-b", ["pull", "--yes"]);
    await detached.expect(/Keep mine[\s\S]*Take server[\s\S]*Merge/, "\r");
    await c.finish("device-b", "detached keep mine", detached);
    await c.run("device-b", ["push", "--yes"]);
    await c.run("device-a", ["pull", "--yes"]);

    await writeFile(join(c.get("device-a").checkout, ".env"), "TOKEN=aligned-server\n");
    await writeFile(join(checkout, ".env"), "TOKEN=aligned-local\n");
    await c.run("device-a", ["push", "--yes"]);
    await c.run("device-b", ["pull", "--yes"], 3);
    await writeFile(join(checkout, ".env"), "TOKEN=aligned-server\n");
    await c.run("device-b", ["pull", "--yes"]);
    await c.run("device-b", ["resolve", "--list", "--json"]);
  },
} satisfies IScenario;
