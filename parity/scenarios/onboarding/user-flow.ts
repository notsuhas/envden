import { strictEqual } from "node:assert";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";
import type { Terminal } from "../../harness/process.ts";

async function preferences(t: Terminal) {
  for (const prompt of [
    "anonymous telemetry",
    "Check for updates daily",
    "Install the shell notice",
    "Install the agent skill",
    "Sync env files for these checkouts",
  ])
    await t.expect(prompt, "\r");
}

export default {
  name: "user-flow",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const server = await c.server();

    const original =
      "# shared settings\nAPI_URL=https://api.example.com\n\n# keep this blank line above\nTOKEN=one\n";

    const edited =
      "# shared settings\nAPI_URL=https://api.example.com\n\n\n# edited on device A\nTOKEN=two # inline note\nNEW_KEY=\n";

    await c.device("device-a", original);
    await c.device("device-b");
    const setup = c.pty("device-a", ["setup"]);
    await setup.expect("Host the server on this machine", "\r");
    await setup.expect("Server address", `${server.url}\r`);
    await setup.expect("Server setup token", `${server.token}\r`);
    await setup.expect("Device name", "\r");
    await setup.expect("Master password", `${password}\r`);
    await setup.expect("Confirm master password", `${password}\r`);
    await setup.expect("Open it now?", "n");
    await preferences(setup);
    await c.finish("device-a", "setup like a user", setup);
    const add = c.pty("device-a", ["device", "add"]);
    await add.expect("Master password", `${password}\r`);
    const code = await add.expect(/\b(\d{1,3}-[0-9A-Z]{4}-[0-9A-Z]{4})\b/);
    const joining = c.pty("device-b", ["join", server.url]);
    await joining.expect("Device name", "\r");
    await joining.expect("Pairing code", `${code}\r`);
    await add.expect("Add ", "y");
    await c.finish("device-a", "approve like a user", add);
    await preferences(joining);
    await c.finish("device-b", "join like a user", joining);
    const a = join(c.get("device-a").checkout, ".env");
    const b = join(c.get("device-b").checkout, ".env");
    strictEqual(await readFile(b, "utf8"), original);
    await writeFile(a, edited);
    await c.run("device-a", ["status"]);
    await c.run("device-a", ["push", "--yes"]);
    await c.run("device-b", ["status"]);
    await c.run("device-b", ["pull", "--yes"]);
    strictEqual(await readFile(b, "utf8"), edited);
    await writeFile(a, "API_URL=https://api.example.com\nTOKEN=from-a\n");
    await writeFile(b, "API_URL=https://api.example.com\nTOKEN=from-b\n");
    await c.run("device-a", ["push", "--yes"]);
    await c.run("device-b", ["pull", "--yes"], 3);
    await c.run("device-b", ["status"]);
    const listed = await c.run("device-b", ["resolve", "--list", "--json"]);
    const file = JSON.parse(listed.stdout)[0].file;
    const markers = await readFile(file, "utf8");

    if (
      !["<<<<<<<", "TOKEN=from-a", "TOKEN=from-b", ">>>>>>>"].every((part) =>
        markers.includes(part),
      )
    )
      throw new Error("Missing conflict side");

    await c.run("device-b", ["resolve"], 2);
    const resolved = "API_URL=https://api.example.com\nTOKEN=agreed\n";
    await writeFile(file, resolved);
    await c.run("device-b", ["resolve"]);
    await c.run("device-b", ["push", "--yes"]);
    await c.run("device-a", ["pull", "--yes"]);
    for (const file of [a, b]) strictEqual(await readFile(file, "utf8"), resolved);
    for (const role of ["device-a", "device-b"]) await c.run(role, ["status"]);
  },
} satisfies IScenario;
