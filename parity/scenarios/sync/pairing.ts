import { gatePairing } from "../../runtime/server/pairing-proxy.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cli, edit, reports } from "../steps/cli.ts";
import {
  answerPassword,
  pairingCode,
  preferences,
  setup,
  syncCheckouts,
} from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

const edited = "# edited\nTOKEN=two\nNEW_KEY=\n";

function otherMailbox(code: string): string {
  const [mailbox = "1", ...rest] = code.split("-");

  return [String((Number(mailbox) % 999) + 1), ...rest].join("-");
}

export const pairing: IScenario = {
  name: "pairing-sync",
  roles: ["server", "a", "b"],

  needs: "stand-in",
  steps: [
    ...setup({ front: (_, s) => gatePairing(s) }),
    {
      name: "pair after a wrong mailbox",
      run: async (c) => {
        await c.device("b");

        const url = c.servers.get("main")!.url;
        const joinArgs = ["join", url, "--name", "device-b", "--yes", ...preferences];
        const add = c.terminal("a", ["device", "add"]);

        await add.answers(answerPassword);

        const code = await add.expect(pairingCode);
        const wrong = c.terminal("b", joinArgs);

        await wrong.answers([{ expect: "Pairing code", send: `${otherMailbox(code)}\r` }]);
        await c.finish("b", joinArgs, wrong, 1);

        const joining = c.terminal("b", joinArgs);

        await joining.answers([{ expect: "Pairing code", send: `${code}\r` }]);
        await add.answers([{ expect: "Add device-b?", send: "y", choices: ["Yes", "No"] }]);
        await c.finish("a", ["device", "add"], add);
        await joining.answers([syncCheckouts]);
        await c.finish("b", joinArgs, joining);
      },
    },
    edit("a", edited),
    cli("a", ["status"]),
    cli("a", ["push", "--yes"]),
    cli("b", ["status", "--json"]),
    cli("b", ["pull", "--yes"]),
    ...reports,
    {
      name: "check transferred bytes",
      run: async (c) => {
        if ((await readFile(join(c.get("b").checkout, ".env"), "utf8")) !== edited)
          throw new Error("Pull did not transfer fixture");
      },
    },
    cli("a", ["device", "ls"]),
    cli("a", ["device", "ls", "--json"]),
    cli("b", ["device", "rename", "renamed"]),
    cli("b", ["device", "rename", "renamed"]),
    {
      name: "remove the paired device",
      run: async (c) => {
        await c.pty(
          "a",
          ["device", "rm", "renamed"],
          [...answerPassword, { expect: "Remove this device?", send: "y", choices: ["Yes", "No"] }],
        );
      },
    },
    cli("b", ["push", "--yes"], 1),
  ],
};
