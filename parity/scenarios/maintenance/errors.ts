import type { IScenario } from "../types.ts";
import { preferences, setup } from "../onboarding.ts";

export const errorScenarios: IScenario[] = [
  {
    name: "onboarding-errors",
    steps: [
      ...setup(),
      {
        name: "reject invalid token without TTY",
        run: async (c) => {
          await c.device("c");
          const args = [
            "setup",
            "--yes",
            "--server",
            c.servers.get("main")!.url,
            "--setup-token",
            "invalid",
            "--name",
            "device-c",
            ...preferences,
            "--scan-root",
            c.get("c").home,
          ];
          await c.cli("c", args, 2);
        },
      },
      {
        name: "unreachable server with valid token",
        run: async (c) => {
          await c.cli(
            "c",
            [
              "setup",
              "--yes",
              "--server",
              "http://127.0.0.1:1",
              "--setup-token",
              c.servers.get("main")!.token,
              "--name",
              "device-c",
              ...preferences,
              "--scan-root",
              c.get("c").home,
            ],
            1,
          );
        },
      },
      {
        name: "unknown pairing mailbox",
        run: async (c) => {
          await c.pty(
            "b",
            ["join", c.servers.get("main")!.url, "--name", "device-b", "--yes", ...preferences],
            [{ expect: "Pairing code", send: "999-AAAA-BBBB\r" }],
            1,
          );
        },
      },
    ],
  },
];
