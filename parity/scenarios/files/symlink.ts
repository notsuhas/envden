import { mkdir, readFile, readlink, symlink as link, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TContext } from "../../runtime/context.ts";
import { original, setup } from "../steps/onboarding.ts";
import type { IScenario } from "../types.ts";

function shared(c: TContext): string {
  return join(c.get("a").home, "shared.env");
}

export const symlink: IScenario = {
  name: "symlink-takeover",
  roles: ["server", "a"],

  needs: "stand-in",
  steps: [
    ...setup(),
    {
      name: "replace managed placement with foreign link",
      run: async (c) => {
        await c.cli("a", ["untrack", c.get("a").checkout]);
        c.normalizer.literal(original);
        await writeFile(shared(c), original);
        await unlink(join(c.get("a").checkout, ".env"));
        await link(shared(c), join(c.get("a").checkout, ".env"));
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
            { expect: "Let envden manage it?", send: "y", choices: ["Yes", "No"] },
          ],
        );

        if ((await readlink(join(c.get("a").checkout, ".env"))) === shared(c))
          throw new Error("Foreign symlink was not taken over");

        if ((await readFile(shared(c), "utf8")) !== original)
          throw new Error("Takeover changed the shared file");
      },
    },
    {
      name: "approved takeover reports a local change",
      run: async (c) => {
        const content = original + "TAKEOVER=changed\n";
        c.normalizer.literal(content);
        await writeFile(join(c.get("a").checkout, ".env"), content);
        const result = await c.cli("a", ["status", "--json"]);
        const status = JSON.parse(result.stdout) as { files: { state: string }[] };

        if (status.files.length !== 1 || status.files[0]?.state !== "changed")
          throw new Error("Approved takeover must report changed");
      },
    },
    {
      name: "restore original user link",
      run: async (c) => {
        await c.cli("a", ["untrack", c.get("a").checkout]);

        if ((await readlink(join(c.get("a").checkout, ".env"))) !== shared(c))
          throw new Error("Untrack did not restore the foreign symlink");
      },
    },
  ],
};
