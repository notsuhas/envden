import { strictEqual } from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setup, recoveryJoin } from "../harness/onboarding.ts";
import type { IScenario } from "../harness/types.ts";

export default {
  name: "sync",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const { server, kit } = await setup(c);
    await recoveryJoin(c, server.url, kit);

    for (const role of ["device-a", "device-b"]) {
      await c.run(role, ["status"]);
      await c.run(role, ["status", "--json"]);
    }

    await writeFile(join(c.get("device-a").checkout, ".env"), "# edited\nTOKEN=two\nEMPTY=\n");
    await c.run("device-a", ["diff"]);
    await c.run("device-a", ["diff", "--json"]);
    await c.run("device-a", ["push", "--yes"]);
    await c.run("device-b", ["pull", "--yes"]);
    await c.run("device-a", ["history", ".env", "--json"]);
    await writeFile(join(c.get("device-a").checkout, ".env"), "TOKEN=alpha\n");
    await writeFile(join(c.get("device-b").checkout, ".env"), "TOKEN=beta\n");
    await c.run("device-a", ["push", "--yes"]);
    await c.run("device-b", ["pull", "--yes"], 3);
    await c.run("device-b", ["resolve", "--list"]);
    const listed = await c.run("device-b", ["resolve", "--list", "--json"]);
    const conflicts = JSON.parse(listed.stdout);
    const refused = await c.run("device-b", ["resolve"], 2);
    if (!refused.stderr.includes("Conflict markers")) throw new Error("Missing marker guard");
    await writeFile(conflicts[0].file, "TOKEN=agreed\n");
    await c.run("device-b", ["resolve"]);
    await c.run("device-b", ["push", "--yes"]);
    await c.run("device-a", ["pull", "--yes"]);

    for (const role of ["device-a", "device-b"]) {
      strictEqual(await readFile(join(c.get(role).checkout, ".env"), "utf8"), "TOKEN=agreed\n");
    }

    await c.run("device-a", ["alias", "example.com/fork/parity", "example.com/envden/parity"]);

    await c.finish(
      "device-a",
      "history restore",
      c.pty("device-a", ["history", ".env", "--restore", "1", "--yes", "--json"]),
    );

    await c.run("device-a", ["rm", ".env", "--yes", "--json"]);
    await c.run("device-a", ["push", "--yes"]);
    await c.run("device-b", ["pull", "--yes"]);
  },
} satisfies IScenario;
