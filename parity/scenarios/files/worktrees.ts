import { join } from "node:path";
import { cli, edit } from "../steps/cli.ts";
import { setup } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

export const worktrees: IScenario = {
  name: "files-worktrees",
  roles: ["server", "a"],

  needs: "stand-in",
  steps: [
    ...setup(),
    {
      name: "add registered worktree",
      run: async (c) => {
        await c.git("a", ["worktree", "add", "-qb", "feature", join(c.get("a").home, "feature")]);
      },
    },
    {
      name: "auto approve worktree",
      run: async (c) => {
        await c.cli("a", ["track", c.get("a").home]);
      },
    },
    cli("a", ["pull", "--yes", "--all"]),
    cli("a", ["status", "--json"]),
    cli("a", ["config", "placement"]),
    {
      name: "switch checkout placement",
      run: async (c) => {
        await c.cli("a", ["config", "placement", c.get("a").checkout, "copy"]);
      },
    },
    edit("a", "LOCAL=literal-1234567890123456789012345678901234567890\n", ".env.local"),
    {
      name: "track newly added file",
      run: async (c) => {
        await c.cli("a", ["track", c.get("a").checkout]);
      },
    },
    cli("a", ["local-only", ".env.local"]),
    cli("a", ["alias", "example.com/fork/parity", "example.com/envden/parity"]),
    cli("a", ["rm", ".env", "--yes"]),
    cli("a", ["push", "--yes"]),
    cli("a", ["status", "--json"]),
    {
      name: "untrack",
      run: async (c) => {
        await c.cli("a", ["untrack", c.get("a").checkout]);
      },
    },
  ],
};
