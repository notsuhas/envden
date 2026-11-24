import { test, expect } from "bun:test";
import { readFile, readlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execTrustedSync } from "@envden/core/process";
import { emptyState } from "../../../state/model.ts";
import { linkCheckout } from "../../place.ts";
import { offerTakeover } from "../offer.ts";
import { fixture } from "./fixture.ts";

// 1Password serves local .env files as named pipes; reading one blocks while holding the state lock
test("a link to a named pipe is never offered or opened", async () => {
  const f = await fixture();

  try {
    const pipe = join(f.root, "op.env");
    execTrustedSync("mkfifo", [pipe]);
    const state = emptyState("test");
    const checkout = await f.checkout("app", "host/app", pipe);
    const links = await linkCheckout(f.adapters, state, checkout, async () => true);
    const questions: string[] = [];

    const left = await offerTakeover(f.adapters, state, links, false, async (question) => {
      questions.push(question);

      return true;
    });

    expect(questions).toEqual([]);
    expect(left).toHaveLength(1);
    expect(await readlink(join(checkout.root, ".env"))).toBe(pipe);
  } finally {
    await f.close();
  }
});

test("a link to another env file in the same checkout is left alone and keeps working", async () => {
  const f = await fixture([".env", ".env.development"]);

  try {
    const state = emptyState("test");
    const checkout = await f.checkout("app", "host/app", ".env.development");
    await writeFile(join(checkout.root, ".env.development"), "A=1\n");

    expect(await linkCheckout(f.adapters, state, checkout, async () => true)).toEqual([]);
    expect(await readlink(join(checkout.root, ".env"))).toBe(".env.development");
    expect(await readFile(join(checkout.root, ".env"), "utf8")).toBe("A=1\n");
    expect(state.links.map((link) => link.path)).toEqual([".env.development"]);
  } finally {
    await f.close();
  }
});

test("one failed takeover leaves that link and carries on with the rest", async () => {
  const f = await fixture();

  try {
    const shared = join(f.root, "shared.env");
    await writeFile(shared, "A=1\n");
    const state = emptyState("test");
    const links = [];

    for (const item of [
      await f.checkout("main", "host/app", shared),
      await f.checkout("worktree", "host/app", shared),
    ])
      links.push(...(await linkCheckout(f.adapters, state, item, async () => true)));

    f.adapters.repo.ensureIgnored = async (checkout) => {
      if (checkout.root.endsWith("main")) throw new Error("read-only .gitignore");
    };

    const left = await offerTakeover(f.adapters, state, links, false, async () => true);

    expect(left.map((link) => link.checkout.root)).toEqual([join(f.root, "main")]);
    expect(state.links.map((link) => link.root)).toEqual([join(f.root, "worktree")]);

    expect(f.errors).toEqual([expect.stringMatching(/~\/main\/\.env.*~\/shared\.env/)]);
  } finally {
    await f.close();
  }
});
