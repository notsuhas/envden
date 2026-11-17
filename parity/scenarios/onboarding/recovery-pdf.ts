import { join } from "node:path";
import { cli } from "../steps/cli.ts";
import { answerPassword, joinKit, setup } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

export const recoveryPdf: IScenario = {
  name: "recovery-pdf",
  roles: ["server", "a", "b"],

  needs: "stand-in",
  steps: [
    ...setup(),
    joinKit(),
    {
      name: "remove a kit holder with a replacement JSON kit",
      run: async (c) => {
        await c.pty(
          "a",
          [
            "device",
            "rm",
            "device-b",
            "--new-kit",
            "--kit-out",
            join(c.get("a").home, "removal.json"),
          ],
          [...answerPassword, { expect: "Remove this device?", send: "y", choices: ["Yes", "No"] }],
        );
      },
    },
    {
      name: "replace the kit with a PDF",
      run: async (c) => {
        await c.pty(
          "a",
          ["vault", "kit", "replace"],
          [...answerPassword, { expect: "Open it now?", send: "n", choices: ["Yes", "No"] }],
        );
      },
    },
    cli("a", ["device", "ls", "--json"]),
  ],
};
