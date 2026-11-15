import { test, expect } from "bun:test";
import { lstat, mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { emptyState } from "../../../state/model.ts";
import { storePath } from "../../../store/path.ts";
import { atomicWrite } from "../../../state/store/files.ts";
import { linkCheckout } from "../../place.ts";
import { offerTakeover } from "../offer.ts";
import { clock, fixture } from "./fixture.ts";

// two worktrees of one repo share a store file; a second target is declined
test("taking over a shared target links every checkout to the store and keeps the original", async () => {
  const f = await fixture();

  try {
    const shared = join(f.root, ".config", "dev-envs", "app", ".env");
    await mkdir(join(shared, ".."), { recursive: true });
    await writeFile(shared, "A=1\n");
    await writeFile(join(f.root, "other.env"), "B=2\n");
    const state = emptyState("test");
    const links = [];

    for (const item of [
      await f.checkout("main", "host/app", shared),
      await f.checkout(
        join(".t3", "worktrees", "feature"),
        "host/app",
        join("..", "..", "..", ".config", "dev-envs", "app", ".env"),
      ),
      await f.checkout("other", "host/other", join(f.root, "other.env")),
    ])
      links.push(...(await linkCheckout(f.adapters, state, item, async () => true)));

    const questions: string[] = [];

    const left = await offerTakeover(f.adapters, state, links, false, async (question) => {
      questions.push(question);

      return question.includes("dev-envs");
    });

    expect(questions).toHaveLength(2);
    expect(left.map((link) => link.checkout.repoId)).toEqual(["host/other"]);
    const store = storePath(f.adapters.home, "host/app", ".env");

    for (const path of ["main", join(".t3", "worktrees", "feature")]) {
      expect(await readlink(join(f.root, path, ".env"))).toBe(store);
      expect(await readFile(join(f.root, path, ".env"), "utf8")).toBe("A=1\n");
    }

    expect((await lstat(shared)).isFile()).toBe(true);
    expect(await readFile(shared, "utf8")).toBe("A=1\n");
    expect(state.links.map((link) => link.store)).toEqual([store, store]);
    expect(await readlink(join(f.root, "other", ".env"))).toBe(join(f.root, "other.env"));
    expect(f.errors).toEqual([]);
  } finally {
    await f.close();
  }
});

test("a missing target is not offered and a differing synced copy leaves the link in place", async () => {
  const f = await fixture();

  try {
    const state = emptyState("test");
    const missing = join(f.root, "missing.env");
    const differing = join(f.root, "mine.env");
    await writeFile(differing, "MINE=1\n");
    await atomicWrite(storePath(f.adapters.home, "host/kept", ".env"), "SYNCED=1\n", clock);
    const links = [];

    for (const item of [
      await f.checkout("dangling", "host/dangling", missing),
      await f.checkout("kept", "host/kept", differing),
    ])
      links.push(...(await linkCheckout(f.adapters, state, item, async () => true)));

    const left = await offerTakeover(f.adapters, state, links, false, async () => true);

    expect(left).toHaveLength(2);
    expect(await readlink(join(f.root, "dangling", ".env"))).toBe(missing);
    expect(await readlink(join(f.root, "kept", ".env"))).toBe(differing);
    expect(state.links).toEqual([]);

    expect(f.errors).toEqual([
      "envden: left ~/kept/.env linked to ~/mine.env: its synced copy differs",
    ]);
  } finally {
    await f.close();
  }
});
