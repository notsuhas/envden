import { gatePairing } from "../../runtime/server/pairing-proxy.ts";
import { answerPassword, pairingCode, setup, syncCheckouts } from "../steps/onboarding.ts";
import { cli } from "../steps/cli.ts";
import type { IScenario, IStep } from "../types.ts";

function wrongSecret(code: string): string {
  return code.slice(0, -1) + (code.endsWith("A") ? "B" : "A");
}

function attempt(wrong: boolean): IStep {
  return {
    name: wrong ? "wrong secret leaves the approver waiting" : "fresh code succeeds",
    run: async (c) => {
      const add = c.terminal("a", ["device", "add"]);

      await add.answers(answerPassword);

      const code = await add.expect(pairingCode);
      const args = ["join", c.servers.get("main")!.url, "--name", "device-b", "--yes"];
      const joining = c.terminal("b", args);

      await joining.answers([
        { expect: "Pairing code", send: `${wrong ? wrongSecret(code) : code}\r` },
      ]);

      if (wrong) {
        await c.finish("b", args, joining, 1);
        add.send("\x03");
        await c.finish("a", ["device", "add"], add, 130);

        return;
      }

      await add.answers([{ expect: "Add device-b?", send: "y", choices: ["Yes", "No"] }]);
      await c.finish("a", ["device", "add"], add);
      await joining.answers([syncCheckouts]);
      await c.finish("b", args, joining);
    },
  };
}

export const pairingSecret: IScenario = {
  name: "pairing-secret",
  roles: ["server", "a", "b"],

  needs: "stand-in",
  steps: [
    ...setup({ front: (_, s) => gatePairing(s) }),
    {
      name: "joining device",
      run: async (c) => {
        await c.device("b");
      },
    },
    attempt(true),
    attempt(false),
    cli("a", ["device", "ls", "--verbose"]),
  ],
};
