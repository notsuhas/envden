import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { cli } from "../steps/cli.ts";
import { readKit } from "../steps/kit.ts";
import { kitPath, password, preferences, syncCheckouts } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

export const onboardingOptions: IScenario = {
  name: "onboarding-options",
  roles: ["server", "a", "b"],

  needs: "stand-in",
  steps: [
    {
      name: "setup with explicit options",
      run: async (c) => {
        const s = await c.serve();
        const d = await c.device("a", "TOKEN=one\n");

        await mkdir(join(d.home, "excluded"));

        await c.pty(
          "a",
          [
            "setup",
            "--server",
            s.url,
            "--setup-token",
            s.token,
            "--name",
            "device-a",
            "--kit-out",
            kitPath(c),
            "--scan-root",
            d.home,
            "--exclude-root",
            join(d.home, "excluded"),
            "--verbose",
            ...preferences,
          ],
          [
            { expect: "Master password", send: `${password}\r` },
            { expect: "Confirm master password", send: `${password}\r` },
            syncCheckouts,
          ],
        );
      },
    },
    {
      name: "join by pasting the recovery kit",
      run: async (c) => {
        const kit = await readKit(kitPath(c));

        await c.device("b");

        await c.pty(
          "b",
          ["join", c.servers.get("main")!.url, "--recovery", "--name", "device-b", ...preferences],
          [
            { expect: "Recovery secret key", send: `${kit.secretKey}\r` },
            { expect: /Vault ID/, send: `${kit.vaultId}\r` },
            { expect: "Master password", send: `${password}\r` },
            syncCheckouts,
          ],
        );
      },
    },
    cli("a", ["status", "--refresh-cache"]),
  ],
};
