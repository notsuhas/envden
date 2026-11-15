import { mkdir, symlink, writeFile, unlink, readlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IScenario } from "./types.ts";
import { setup, original } from "./onboarding.ts";
import { cli, edit } from "./sync.ts";

export const fileScenarios: IScenario[] = [
  {
    name: "files-worktrees",
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
  },
  {
    name: "symlink-takeover",
    steps: [
      ...setup(),
      {
        name: "replace managed placement with foreign link",
        run: async (c) => {
          await c.cli("a", ["untrack", c.get("a").checkout]);
          const target = join(c.get("a").home, "shared.env");
          const literal = original;
          c.normalizer.literal(literal);
          await writeFile(target, literal);
          await unlink(join(c.get("a").checkout, ".env"));
          await symlink(target, join(c.get("a").checkout, ".env"));
          await mkdir(join(c.get("a").home, "empty"));
        },
      },
      {
        name: "approve takeover",
        run: async (c) => {
          await c.pty(
            "a",
            ["track", c.get("a").checkout],
            [
              { expect: "Sync env files for these checkouts", send: "\r" },
              { expect: "Let envden manage it?", send: "y" },
            ],
          );
          const target = join(c.get("a").home, "shared.env");
          if ((await readlink(join(c.get("a").checkout, ".env"))) === target)
            throw new Error("Foreign symlink was not taken over");
          if ((await readFile(target, "utf8")) !== original)
            throw new Error("Takeover changed the shared file");
        },
      },
      cli("a", ["status", "--json"]),
      {
        name: "restore original user link",
        run: async (c) => {
          await c.cli("a", ["untrack", c.get("a").checkout]);
          if (
            (await readlink(join(c.get("a").checkout, ".env"))) !==
            join(c.get("a").home, "shared.env")
          )
            throw new Error("Untrack did not restore the foreign symlink");
        },
      },
    ],
  },
];
