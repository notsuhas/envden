import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { gatePairing } from "../../runtime/server/pairing-proxy.ts";
import type { TContext } from "../../runtime/context.ts";
import { cli } from "../steps/cli.ts";
import { answerPassword, kitPath, pair, password } from "../steps/onboarding.ts";
import type { IScenario, IStep } from "../types.ts";

async function kitJoin(c: TContext): Promise<void> {
  const url = c.servers.get("main")!.url;
  const args = ["join", url, "--name", "device-b", "--recovery-kit", kitPath(c), "--yes"];

  await c.pty("b", args, answerPassword);
}

function rejoin(mode: "kit" | "pairing"): IStep[] {
  return [
    {
      name: `remove b before a ${mode} rejoin`,
      run: async (c) => {
        await c.pty(
          "a",
          ["device", "rm", "device-b"],
          [
            ...answerPassword,
            { expect: "Remove this device?", send: "y" },
            { expect: "Replace the recovery kit in this removal?", send: "\r" },
          ],
        );
      },
    },
    {
      name: `${mode} rejoin`,
      run: async (c) => {
        if (mode === "kit") return kitJoin(c);

        const { joining, args } = await pair(c, "b", ["--yes"]);

        await c.finish("b", args, joining);
      },
    },
    cli("b", ["device", "ls", "--json"]),
  ];
}

export const rejoinAfterRemoval: IScenario = {
  name: "rejoin-after-removal",
  roles: ["server", "a", "b"],

  needs: "stand-in",
  steps: [
    {
      name: "setup without checkouts",
      run: async (c) => {
        const s = await c.serve();
        const scan = join((await c.device("a")).home, "empty-scan");

        gatePairing(s);
        await mkdir(scan);

        await c.pty(
          "a",
          ["setup", "--server", s.url, "--name", "device-a", "--kit-out", kitPath(c), "--yes"],
          [
            { expect: "Server setup token", send: `${s.token}\r` },
            ...answerPassword,
            { expect: "Confirm master password", send: `${password}\r` },
          ],
        );
      },
    },
    {
      name: "first kit join",
      run: async (c) => {
        await c.device("b");
        await kitJoin(c);
      },
    },
    ...rejoin("kit"),
    ...rejoin("pairing"),
  ],
};
