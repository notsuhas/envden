import { preferences, setup } from "../steps/onboarding.ts";
import type { TContext } from "../../runtime/context.ts";
import type { IScenario } from "../types.ts";

function setupArgs(c: TContext, server: string, token: string): string[] {
  return [
    "setup",
    "--yes",
    "--server",
    server,
    "--setup-token",
    token,
    "--name",
    "device-c",
    ...preferences,
    "--scan-root",
    c.get("c").home,
  ];
}

export const onboardingErrors: IScenario = {
  name: "onboarding-errors",
  roles: ["server", "a", "b", "c"],

  needs: "stand-in",
  steps: [
    ...setup(),
    {
      name: "reject invalid token without TTY",
      run: async (c) => {
        await c.device("c");
        await c.cli("c", setupArgs(c, c.servers.get("main")!.url, "invalid"), 2);
      },
    },
    {
      name: "unreachable server with valid token",
      run: async (c) => {
        await c.cli("c", setupArgs(c, "http://127.0.0.1:1", c.servers.get("main")!.token), 1);
      },
    },
    {
      name: "unknown pairing mailbox",
      run: async (c) => {
        await c.device("b");

        await c.pty(
          "b",
          ["join", c.servers.get("main")!.url, "--name", "device-b", "--yes", ...preferences],
          [{ expect: "Pairing code", send: "999-AAAA-BBBB\r" }],
          1,
        );
      },
    },
    {
      name: "resume without a pending join",
      run: async (c) => {
        await c.cli(
          "b",
          ["join", c.servers.get("main")!.url, "--resume", "--name", "b", "--yes"],
          1,
        );
      },
    },
  ],
};
