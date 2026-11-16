import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cli } from "../steps/cli.ts";
import { answerPassword, kitPath, setup, syncCheckouts } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

const local = "TOKEN=two\n";

export const localFileChoice: IScenario = {
  name: "join-local-file-choice",
  roles: ["server", "a", "b"],

  needs: "stand-in",
  steps: [
    ...setup(),
    {
      name: "join keeps the chosen local file",
      run: async (c) => {
        await c.device("b", local);

        await c.pty(
          "b",
          [
            "join",
            c.servers.get("main")!.url,
            "--name",
            "device-b",
            "--recovery-kit",
            kitPath(c),
            "--yes",
          ],
          [
            ...answerPassword,
            syncCheckouts,
            { expect: /\.env differs from the server's copy[\s\S]*Merge both/, send: "\r" },
          ],
        );

        if ((await readFile(join(c.get("b").checkout, ".env"), "utf8")) !== local)
          throw new Error("Join discarded the chosen local bytes");
      },
    },
    cli("b", ["resolve", "--list", "--json"]),
  ],
};
