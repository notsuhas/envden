import { cli } from "../steps/cli.ts";
import { answerPassword, joinKit, password, setup } from "../steps/onboarding.ts";
import { switchTo } from "../steps/server.ts";
import type { IScenario, IStep } from "../types.ts";

function nothingPending(flag: "--resume" | "--abort"): IStep {
  return {
    name: `server move ${flag} with nothing pending`,
    run: async (c) => {
      await c.pty("a", ["server", "move", flag], answerPassword);
    },
  };
}

export const move: IScenario = {
  name: "server-move",
  roles: ["server", "server:destination", "a", "b"],

  needs: "stand-in",
  steps: [
    ...setup(),
    joinKit(),
    {
      name: "start destination and move",
      run: async (c) => {
        const s = await c.serve("destination");

        await c.pty(
          "a",
          ["server", "move", s.url],
          [
            { expect: "Server setup token", send: `${s.token}\r` },
            { expect: "Master password", send: `${password}\r` },
          ],
        );
      },
    },
    cli("a", ["status", "--json"]),
    nothingPending("--resume"),
    nothingPending("--abort"),
    {
      name: "switch the second device",
      run: async (c) => {
        await c.stop("main");
        await switchTo(c, "b", c.servers.get("destination")!.url);
      },
    },
    cli("a", ["status", "--json"]),
    cli("b", ["status", "--json"]),
  ],
};
