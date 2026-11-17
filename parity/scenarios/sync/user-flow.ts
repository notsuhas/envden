import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gatePairing } from "../../runtime/server/pairing-proxy.ts";
import type { TContext } from "../../runtime/context.ts";
import { cli, edit, reports } from "../steps/cli.ts";
import { pair, password } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

const original =
  "# shared settings\nAPI_URL=https://api.example.com\n\n# keep this blank line above\nTOKEN=one\n";

const edited =
  "# shared settings\nAPI_URL=https://api.example.com\n\n\n# edited on device A\nTOKEN=two # inline note\nNEW_KEY=\n";

const resolved = "API_URL=https://api.example.com\nTOKEN=agreed\n";

const defaults = [
  "anonymous telemetry",
  "Check for updates daily",
  "Install the shell notice",
  "Install the agent skill",
  "Sync env files for these checkouts",
].map((expect) => ({
  expect,
  send: "\r",
  ...(expect === "Install the shell notice"
    ? { choices: ["zsh", "bash", "fish", "PowerShell", "No, skip it"] }
    : expect !== "Sync env files for these checkouts"
      ? { choices: ["Yes", "No"] }
      : {}),
}));

async function same(c: TContext, device: string, contents: string): Promise<void> {
  if ((await readFile(join(c.get(device).checkout, ".env"), "utf8")) !== contents)
    throw new Error(`${device} .env differs from the expected bytes`);
}

export const userFlow: IScenario = {
  name: "user-flow",
  roles: ["server", "a", "b"],

  needs: "stand-in",
  steps: [
    {
      name: "setup like a user",
      run: async (c) => {
        await c.device("a", original);

        const s = await c.serve();

        gatePairing(s);

        await c.pty(
          "a",
          ["setup"],
          [
            { expect: "Host the server on this machine", send: "\r", choices: ["Yes", "No"] },
            { expect: "Server address", send: `${s.url}\r` },
            { expect: "Server setup token", send: `${s.token}\r` },
            { expect: "Device name", send: "\r" },
            { expect: "Master password", send: `${password}\r` },
            { expect: "Confirm master password", send: `${password}\r` },
            { expect: "Open it now?", send: "n", choices: ["Yes", "No"] },
            ...defaults,
          ],
        );
      },
    },
    {
      name: "join like a user",
      run: async (c) => {
        const { joining, args } = await pair(c, "b");

        await joining.answers(defaults);
        await c.finish("b", args, joining);
        await same(c, "b", original);
      },
    },
    edit("a", edited),
    cli("a", ["status"]),
    cli("a", ["push", "--yes"]),
    cli("b", ["status"]),
    cli("b", ["pull", "--yes"]),
    {
      name: "pulled bytes are exact",
      run: async (c) => {
        await same(c, "b", edited);
      },
    },
    edit("a", "API_URL=https://api.example.com\nTOKEN=from-a\n"),
    edit("b", "API_URL=https://api.example.com\nTOKEN=from-b\n"),
    cli("a", ["push", "--yes"]),
    cli("b", ["pull", "--yes"], 3),
    cli("b", ["status"]),
    {
      name: "resolve by editing the markers",
      run: async (c) => {
        const listed = JSON.parse((await c.cli("b", ["resolve", "--list", "--json"])).stdout);
        const file: string = listed[0].file;
        const markers = await readFile(file, "utf8");

        for (const part of ["<<<<<<<", "TOKEN=from-a", "TOKEN=from-b", ">>>>>>>"])
          if (!markers.includes(part)) throw new Error("Missing conflict side");

        await c.cli("b", ["resolve"], 2);
        c.normalizer.literal(resolved);
        await writeFile(file, resolved);
        await c.cli("b", ["resolve"]);
      },
    },
    cli("b", ["push", "--yes"]),
    cli("a", ["pull", "--yes"]),
    {
      name: "both sides agree",
      run: async (c) => {
        await same(c, "a", resolved);
        await same(c, "b", resolved);
      },
    },
    ...reports,
    cli("b", ["status"]),
  ],
};
