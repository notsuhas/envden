import { cli } from "../steps/cli.ts";
import { setup } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

export const unreachable: IScenario = {
  name: "unreachable",
  roles: ["server", "a"],

  needs: "stand-in",
  steps: [
    ...setup(),
    {
      name: "stop the server",
      run: async (c) => {
        await c.stop("main");
      },
    },
    cli("a", ["push", "--yes"], 1),
    cli("a", ["pull", "--yes"], 1),
    cli("a", ["status", "--json"]),
  ],
};
