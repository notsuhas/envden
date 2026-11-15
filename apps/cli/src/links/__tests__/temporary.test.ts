import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execTrusted } from "@envden/core/process";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createAdapters } from "../../adapters.ts";
import { emptyState } from "../../state/model.ts";
import { linkCheckout } from "../place.ts";

const fixtureClock = () => 1800000000000;

test("copy leftovers remain excluded from git add and disappear on the next placement", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-copy-ignore-"));
  const checkoutRoot = join(root, "checkout");

  const git = async (...args: string[]) =>
    (await execTrusted("git", ["-C", checkoutRoot, ...args])).stdout;

  try {
    await mkdir(checkoutRoot);
    await git("init");
    await git("remote", "add", "origin", "https://example.com/team/repo.git");
    await writeFile(join(checkoutRoot, ".env"), "KEY=test\n");

    const adapters = createAdapters(
      {
        home: join(root, "home"),
        userHome: root,
        keychain: createMemoryKeychainAdapter([]),
      },
      fixtureClock,
    );

    const checkout = (await adapters.repo.checkoutAt(checkoutRoot))!;
    await adapters.repo.ensureIgnored(checkout, ".env");
    const state = emptyState("test");
    await linkCheckout(adapters, state, checkout, async () => true, true);

    const exclude = resolve(
      checkoutRoot,
      (await git("rev-parse", "--git-path", "info/exclude")).trim(),
    );

    const temporary = (await readFile(exclude, "utf8"))
      .split("\n")
      .find((line) => line.startsWith("/.envden-"))!
      .slice(1);

    await writeFile(join(checkoutRoot, temporary), "LEFTOVER=test\n");
    await git("add", "-A");
    expect(await git("ls-files", "-z")).toBe("");

    await adapters
      .placement("copy", checkoutRoot)
      .place(state.links[0]!.store, join(checkoutRoot, ".env"));

    expect(await readdir(checkoutRoot)).not.toContain(temporary);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
