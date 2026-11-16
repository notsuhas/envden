import type { TContext } from "../../runtime/context.ts";
import { cli } from "../steps/cli.ts";
import { joinKit, password, setup } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

function token(c: TContext): string {
  return c.servers.get("main")!.token;
}

function repair(drop: boolean): IScenario {
  return {
    name: drop ? "server-repair-without" : "server-repair",
    roles: ["server", "a", "b"],

    needs: "stand-in",
    steps: [
      ...setup(),
      joinKit(),
      {
        name: "restart server in restored mode",
        run: async (c) => {
          await c.stop("main");
          await c.serve("main", true);
        },
      },
      {
        name: "upload device repair reports",
        run: async (c) => {
          await c.cli("a", ["server", "repair", "--repair-token", token(c)]);
          if (!drop) await c.cli("b", ["server", "repair", "--repair-token", token(c)]);
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
              "--finish",
              ...(drop ? ["--without", "device-b", "--accept-lost"] : []),
            ],
            [
              { expect: "Repair token", send: `${token(c)}\r` },
              { expect: "Master password", send: `${password}\r` },
            ],
          );
        },
      },
      cli("a", ["status", "--json"]),
      cli("a", ["device", "ls", "--json"]),
      cli("b", ["push", "--yes"], drop ? 1 : 0),
    ],
  };
}

export const repairs = [repair(false), repair(true)];
