import { setup, password } from "../harness/onboarding.ts";
import type { IScenario } from "../harness/types.ts";

export default {
  name: "pairing",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const { server } = await setup(c);
    await c.device("device-b");
    const add = c.pty("device-a", ["device", "add"]);
    await add.expect("Master password", `${password}\r`);
    const code = await add.expect(/\b(\d{1,3}-[0-9A-Z]{4}-[0-9A-Z]{4})\b/);
    const wrong = c.pty("device-b", ["join", server.url, "--name", "beta", "--yes"]);
    const pieces = code.split("-");
    pieces[0] = String((Number(pieces[0]) % 999) + 1);
    await wrong.expect("Pairing code", `${pieces.join("-")}\r`);
    await c.finish("device-b", "join wrong pairing mailbox", wrong, 1);
    const join = c.pty("device-b", ["join", server.url, "--name", "beta", "--yes"]);
    await join.expect("Pairing code", `${code}\r`);
    await add.expect("Add ", "y");
    await c.finish("device-a", "device add", add);
    await join.expect("Sync env files for these checkouts", "\r");
    await c.finish("device-b", "join pairing", join);
    await c.run("device-a", ["device", "ls"]);
    await c.run("device-a", ["device", "ls", "--json"]);
    await c.run("device-b", ["device", "rename", "renamed"]);
    await c.run("device-b", ["device", "rename", "renamed"]);
    const rm = c.pty("device-a", ["device", "rm", "renamed"]);
    await rm.expect("Master password", `${password}\r`);
    await rm.expect("Remove this device?", "y");
    await c.finish("device-a", "device rm", rm);
    await c.run("device-b", ["push", "--yes"], 1);
  },
} satisfies IScenario;
