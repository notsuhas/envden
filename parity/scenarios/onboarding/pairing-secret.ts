import { setup, password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

function wrongCode(code: string) {
  return code.slice(0, -1) + (code.endsWith("A") ? "B" : "A");
}

export default {
  name: "pairing-secret",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const { server } = await setup(c);
    await c.device("device-b");

    for (const wrong of [true, false]) {
      const add = c.pty("device-a", ["device", "add"]);
      await add.expect("Master password", `${password}\r`);
      const code = await add.expect(/\b(\d{1,3}-[0-9A-Z]{4}-[0-9A-Z]{4})\b/);
      const attempt = wrong ? wrongCode(code) : code;
      const joining = c.pty("device-b", ["join", server.url, "--name", "beta", "--yes"]);
      await joining.expect("Pairing code", `${attempt}\r`);

      if (wrong) {
        await c.finish("device-b", "wrong pairing secret", joining, 1);
        add.send("\x03");
        await c.finish("device-a", "cancel failed authentication approver", add, 130);
      } else {
        await add.expect("Add ", "y");
        await c.finish("device-a", "fresh code approval", add);
        await joining.expect("Sync env files for these checkouts", "\r");
        await c.finish("device-b", "fresh code join", joining);
      }
    }

    await c.run("device-a", ["device", "ls", "--verbose"]);
  },
} satisfies IScenario;
