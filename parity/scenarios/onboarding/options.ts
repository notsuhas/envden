import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { password } from "../../harness/onboarding.ts";
import type { IScenario } from "../../harness/types.ts";

export default {
  name: "onboarding-options",
  roles: ["server", "device-a", "device-b"],
  async run(c) {
    const server = await c.server();
    const d = await c.device("device-a", "TOKEN=one\n");
    const kit = join(d.home, "kit.json");

    const preferences = [
      "--telemetry",
      "off",
      "--update-check",
      "off",
      "--shell",
      "none",
      "--agent",
      "off",
    ];

    const setup = c.pty("device-a", [
      "setup",
      "--server",
      server.url,
      "--setup-token",
      server.token,
      "--name",
      "alpha",
      "--kit-out",
      kit,
      "--scan-root",
      d.home,
      "--exclude-root",
      join(d.home, "excluded"),
      "--verbose",
      ...preferences,
    ]);

    await setup.expect("Master password", `${password}\r`);
    await setup.expect("Confirm master password", `${password}\r`);
    await setup.expect("Sync env files for these checkouts", "\r");
    await c.finish("device-a", "setup explicit options", setup);
    await c.device("device-b");
    await c.run("device-b", ["join", server.url, "--resume", "--name", "beta", "--yes"], 1);
    const parsed = JSON.parse(await readFile(kit, "utf8"));

    const joining = c.pty("device-b", [
      "join",
      server.url,
      "--recovery",
      "--name",
      "beta",
      ...preferences,
    ]);

    await joining.expect("Recovery secret key", `${parsed.secretKey}\r`);
    await joining.expect("Vault ID", `${parsed.vaultId}\r`);
    await joining.expect("Master password", `${password}\r`);
    await joining.expect("Sync env files for these checkouts", "\r");
    await c.finish("device-b", "paste recovery kit", joining);
    await c.run("device-a", ["status", "--refresh-cache"]);
  },
} satisfies IScenario;
