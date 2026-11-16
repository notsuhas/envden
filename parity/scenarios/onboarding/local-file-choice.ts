import { join } from "node:path";
import { setup, password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "join-local-file-choice",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const { server, kit } = await setup(c);
    await c.device("device-b", "TOKEN=two\n");

    const terminal = c.pty("device-b", [
      "join",
      server.url,
      "--name",
      "beta",
      "--recovery-kit",
      kit,
      "--yes",
    ]);

    await terminal.expect("Master password", `${password}\r`);
    await terminal.expect("Sync env files for these checkouts", "\r");
    await terminal.expect(/\.env differs from the server's copy[\s\S]*Merge both/, "\r");
    await c.finish("device-b", "join keeps chosen local env file", terminal);

    if ((await Bun.file(join(c.get("device-b").checkout, ".env")).text()) !== "TOKEN=two\n")
      throw new Error("Join discarded the chosen local bytes");

    await c.run("device-b", ["resolve", "--list", "--json"]);
  },
} satisfies IScenario;
