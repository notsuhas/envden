import { expect, spyOn, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGitRepoAdapter } from "../adapter.ts";
import { repo } from "./fixture.ts";

test("discovery batches git queries and reuses a real empty global config", async () => {
  const root = await repo();
  const adapter = createGitRepoAdapter({ resolveSshHost: async () => "github.com" });
  const checkout = await adapter.checkoutAt(root);
  if (!checkout) throw new Error("No checkout");
  await writeFile(join(root, ".gitignore"), ".env*\n");
  for (let index = 0; index < 12; index++) await writeFile(join(root, `.env.${index}`), "A=1");
  const spawn = spyOn(Bun, "spawn");

  try {
    expect(await adapter.envFiles(checkout)).toHaveLength(12);
    const calls = spawn.mock.calls.map(([command]) => command);

    expect(
      calls.filter((command) => Array.isArray(command) && command.includes("ls-files")),
    ).toHaveLength(1);

    expect(
      calls.filter((command) => Array.isArray(command) && command.includes("check-ignore")),
    ).toHaveLength(1);

    expect(
      calls.filter((command) => Array.isArray(command) && command.includes("--global")),
    ).toHaveLength(1);

    const configs = spawn.mock.calls.flatMap(
      ([, options]) => options?.env?.GIT_CONFIG_GLOBAL ?? [],
    );

    expect(new Set(configs).size).toBe(1);
    expect(await Bun.file(String(configs[0])).text()).toBe("");
  } finally {
    spawn.mockRestore();
  }
});
