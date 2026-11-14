import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repo, git } from "./fixture.ts";
import { createGitRepoAdapter } from "../adapter.ts";

test("tracked paths respect the probed checkout filesystem", async () => {
  const root = await repo();
  await writeFile(join(root, ".env"), "A=1");
  git(root, "add", ".env");
  const adapter = createGitRepoAdapter();
  const checkout = (await adapter.checkoutAt(root))!;
  const insensitive = await adapter.caseInsensitive(root);
  expect(await adapter.isIgnored(checkout, insensitive ? ".ENV" : ".env")).toBe(false);
});
