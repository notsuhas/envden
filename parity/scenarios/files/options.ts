import { access, readFile, writeFile } from "node:fs/promises";
import { base32, sha256 } from "@envden/core/protocol";
import { z } from "zod";
import { join } from "node:path";
import type { TContext } from "../../runtime/context.ts";
import { cli, edit } from "../steps/cli.ts";
import { setup, syncCheckouts } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

const state = z.object({ links: z.array(z.object({ path: z.string(), store: z.string() })) });

// Shared bases are named by the hash of their store path, a persisted format every port shares.
async function sharedBase(c: TContext): Promise<string> {
  const home = c.get("a").env.ENVDEN_HOME;
  const saved = state.parse(JSON.parse(await readFile(join(home, "state/device.json"), "utf8")));
  const store = saved.links.find((link) => link.path === ".env")?.store;
  if (!store) throw new Error("Missing .env link");

  return join(home, "base", base32(sha256(new TextEncoder().encode(store))));
}

export const fileOptions: IScenario = {
  name: "file-options",
  roles: ["server", "a"],

  needs: "stand-in",
  steps: [
    ...setup(),
    cli("a", ["config", "telemetry"]),
    cli("a", ["config", "update-check"]),
    cli("a", ["config", "agent-merge"]),
    cli("a", ["config", "auto-approve-worktrees", "off"]),
    {
      name: "copy placement",
      run: async (c) => {
        await c.cli("a", ["config", "placement", c.get("a").checkout, "copy"]);
      },
    },
    cli("a", ["config", "env-files", '{"include":[".env",".env.local"],"exclude":[]}']),
    cli("a", ["device", "ls", "--verbose", "--json"]),
    edit("a", "TOKEN=changed\n"),
    cli("a", ["push", "--all", "--yes", "--json"]),
    cli("a", ["history", "--all", "--json"]),
    {
      name: "confirm a restore",
      run: async (c) => {
        await c.pty(
          "a",
          ["history", ".env", "--restore", "1"],
          [
            {
              expect: /version 1\?[\s┃│]+added API_URL;[\s┃│]+changed TOKEN/,
              send: "y",
              choices: ["Yes", "No"],
            },
          ],
        );
      },
    },
    {
      name: "removal drops the shared base and corrupt marker",
      run: async (c) => {
        const base = await sharedBase(c);

        await access(base);
        await writeFile(`${base}.corrupt`, "corrupt");
        await c.cli("a", ["rm", ".env", "--yes"]);

        for (const path of [base, `${base}.corrupt`])
          if (await Bun.file(path).exists()) throw new Error("Removal left a base or marker");
      },
    },
    {
      name: "track with copy placement",
      run: async (c) => {
        await c.cli("a", ["untrack", c.get("a").checkout]);
        await c.pty("a", ["track", c.get("a").checkout, "--copy", "--verbose"], [syncCheckouts]);
      },
    },
  ],
};
