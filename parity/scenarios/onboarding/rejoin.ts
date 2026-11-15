import { setup, password, recoveryJoin } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "rejoin-after-removal",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const { server, kit } = await setup(c);
    await recoveryJoin(c, server.url, kit);

    for (const mode of ["kit", "pairing"]) {
      const remove = c.pty("device-a", ["device", "rm", "beta"]);
      await remove.expect("Master password", `${password}\r`);
      await remove.expect("Remove this device?", "y");

      await remove.expect(
        "This device held recovery keys. Replace the recovery kit in this removal?",
        "\r",
      );

      await c.finish("device-a", `remove before ${mode} rejoin`, remove);
      const args = ["join", server.url, "--name", "beta", "--yes"];
      if (mode === "kit") args.push("--recovery-kit", kit);
      const join = c.pty("device-b", args);

      if (mode === "kit") await join.expect("Master password", `${password}\r`);
      else {
        const add = c.pty("device-a", ["device", "add"]);
        await add.expect("Master password", `${password}\r`);
        const code = await add.expect(/\b(\d{1,3}-[0-9A-Z]{4}-[0-9A-Z]{4})\b/);
        await join.expect("Pairing code", `${code}\r`);
        await add.expect("Add ", "y");
        await c.finish("device-a", "approve pairing rejoin", add);
      }

      await c.finish("device-b", `${mode} rejoin`, join);
      await c.run("device-b", ["device", "ls", "--json"]);
    }

    for (const result of c.results)
      result.stdout = result.stdout.replace(/^envden: beta joined with the recovery kit\n/gm, "");
  },
} satisfies IScenario;
