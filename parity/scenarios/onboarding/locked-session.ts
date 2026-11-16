import { Database } from "bun:sqlite";
import { join } from "node:path";
import { cli } from "../steps/cli.ts";
import { answerPassword, password, setup } from "../steps/onboarding.ts";
import type { IScenario, IStep } from "../types.ts";

function relock(command: "push" | "pull"): IStep {
  return {
    name: `${command} unlocks and retries`,
    run: async (c) => {
      const db = new Database(join(c.servers.get("main")!.directory, "envden.sqlite"));

      db.run("UPDATE devices SET unlocked=0, fresh=0");
      db.close();
      await c.pty("a", [command, "--all", "--yes", "--json"], answerPassword);
    },
  };
}

export const lockedSession: IScenario = {
  name: "locked-session",
  roles: ["server", "a"],

  needs: "stand-in",
  steps: [
    ...setup(),
    {
      name: "shortest unlock period",
      run: async (c) => {
        await c.pty("a", ["config", "unlock-period", "1d"], answerPassword);
      },
    },
    cli("a", ["config", "unlock-period"]),
    {
      name: "exhaust password retries",
      run: async (c) => {
        await c.pty(
          "a",
          ["unlock"],
          [
            { expect: "Master password", send: "wrong\r" },
            { expect: "Wrong master password. Try again", send: "wrong\r" },
            { expect: "Wrong master password. Try again", send: "wrong\r" },
          ],
          1,
        );
      },
    },
    {
      name: "unlock after failures",
      run: async (c) => {
        await c.pty("a", ["unlock"], [{ expect: "Master password", send: `${password}\r` }]);
      },
    },
    relock("push"),
    relock("pull"),
  ],
};
