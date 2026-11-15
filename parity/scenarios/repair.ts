import type { IScenario } from "./types.ts";
import { setup, joinKit, answerPassword } from "./onboarding.ts";
import { cli } from "./sync.ts";

export const repairScenarios: IScenario[] = [false, true].map((drop) => ({
  name: drop ? "server-repair-without" : "server-repair",
  steps: [
    ...setup(),
    joinKit,
    {
      name: "restart server in restored mode",
      run: async (c) => {
        const port = new URL(c.servers.get("main")!.url).port;
        await c.stop("main");
        await c.serve("main", true, port);
      },
    },
    {
      name: "upload device repair reports",
      run: async (c) => {
        const token = c.servers.get("main")!.token;
        await c.cli("a", ["server", "repair", "--repair-token", token]);
        if (!drop) await c.cli("b", ["server", "repair", "--repair-token", token]);
      },
    },
    {
      name: "finish repair",
      run: async (c) => {
        await c.pty(
          "a",
          [
            "server",
            "repair",
            "--repair-token",
            c.servers.get("main")!.token,
            "--finish",
            ...(drop ? ["--without", "device-b", "--accept-lost"] : []),
          ],
          answerPassword,
        );
      },
    },
    cli("a", ["status", "--json"]),
    cli("a", ["device", "ls", "--json"]),
  ],
}));
