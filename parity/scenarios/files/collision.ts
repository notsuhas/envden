import { mkdir, readFile, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { TContext } from "../../runtime/context.ts";
import { cli } from "../steps/cli.ts";
import { setup } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

const links = z.object({ links: z.array(z.looseObject({ path: z.string(), store: z.string() })) });

async function insensitive(c: TContext): Promise<boolean> {
  return Bun.file(join(c.get("a").checkout, "dir/.env")).exists();
}

// Moves Dir/.env.local's store to dir/.env.local so two links differ only in directory case.
async function aliasSecondFile(c: TContext): Promise<void> {
  const statePath = join(c.get("a").env.ENVDEN_HOME, "state/device.json");
  const raw: Record<string, unknown> = JSON.parse(await readFile(statePath, "utf8"));
  const state = links.parse(raw);
  const link = state.links.find((item) => item.path === "Dir/.env.local");
  if (!link) throw new Error("Missing Dir/.env.local link");

  const store = join(dirname(dirname(link.store)), "dir/.env.local");

  await mkdir(dirname(store), { recursive: true });
  await rename(link.store, store);
  await unlink(join(c.get("a").checkout, link.path));
  await mkdir(join(c.get("a").checkout, "dir"), { recursive: true });
  await symlink(store, join(c.get("a").checkout, "dir/.env.local"));
  link.path = "dir/.env.local";
  link.store = store;
  await writeFile(statePath, JSON.stringify({ ...raw, links: state.links }));
}

export const collision: IScenario = {
  name: "directory-collision",
  // Two base entries hold fresh ciphertext in symmetric places, so their labels can swap.
  files: false,
  roles: ["server", "a"],

  needs: "stand-in",
  steps: [
    ...setup(),
    {
      name: "track nested env files",
      run: async (c) => {
        const checkout = c.get("a").checkout;

        await mkdir(join(checkout, "Dir"));
        c.normalizer.literal("FIRST=one\n");
        c.normalizer.literal("SECOND=two\n");
        await writeFile(join(checkout, "Dir/.env"), "FIRST=one\n");
        await writeFile(join(checkout, "Dir/.env.local"), "SECOND=two\n");
        await c.pty("a", ["track", checkout], []);
        await aliasSecondFile(c);
      },
    },
    cli("a", ["push", "--yes", "--json"]),
    {
      name: "pull reports the collision on case-insensitive file systems",
      run: async (c) => {
        await c.cli("a", ["pull", "--yes", "--json"], (await insensitive(c)) ? 3 : 0);

        for (const [path, content] of [
          ["Dir/.env", "FIRST=one\n"],
          ["dir/.env.local", "SECOND=two\n"],
        ])
          if ((await Bun.file(join(c.get("a").checkout, path!)).text()) !== content)
            throw new Error("Collision changed checkout bytes");
      },
    },
  ],
};
