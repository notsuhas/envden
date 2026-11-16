import { test, expect } from "bun:test";
import { deriveAlias } from "../alias.ts";

const fixtureClock = () => 1800000000000;

for (const [source, target, aliases, kind] of [
  ["", "b", {}, "invalid"],
  ["a", "", {}, "invalid"],
  ["a", "a", {}, "invalid"],
  ["a", "b", { b: "c" }, "chain"],
  ["a", "b", { c: "a" }, "chain"],
  ["a", "b", {}, "assign"],
  ["x", "constructor", {}, "assign"],
  ["x", "hasOwnProperty", {}, "assign"],
  ["__proto__", "x", {}, "assign"],
] satisfies [string, string, Record<string, string>, string][])
  test(`alias ${source} ${target} ${JSON.stringify(aliases)}`, () => {
    expect(String(deriveAlias(aliases, source, target).kind)).toBe(kind);
  });

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAdapters } from "../../adapters.ts";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { emptyState } from "../../state/model.ts";
import { saveState, loadState } from "../../state/store/repository.ts";
import { aliasRepo } from "../alias.ts";

test("alias updates persist without losing prior aliases and rejected chains leave state unchanged", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-alias-"));

  const adapters = createAdapters(
    {
      home,
      userHome: home,
      keychain: createMemoryKeychainAdapter([]),
    },
    fixtureClock,
  );

  try {
    await Promise.resolve(
      expect(aliasRepo(adapters, "a", "b")).rejects.toMatchObject({ code: "NOT_FOUND" }),
    );

    const state = emptyState("test");
    state.aliases = { old: "canonical" };
    await saveState(home, state, fixtureClock);
    await aliasRepo(adapters, "a", "b");
    const saved = await loadState(home);
    expect(saved?.aliases).toEqual({ old: "canonical", a: "b" });

    for (const [source, target, code] of [
      ["b", "c", "CONFLICT"],
      ["a", "a", "INVALID_INPUT"],
    ]) {
      await Promise.resolve(
        expect(aliasRepo(adapters, source!, target!)).rejects.toMatchObject({ code }),
      );

      expect(await loadState(home)).toEqual(saved);
    }

    await aliasRepo(adapters, "__proto__", "x");
    await aliasRepo(adapters, "y", "toString");
    const named = (await loadState(home))!.aliases;

    expect(Object.entries(named)).toContainEqual(["__proto__", "x"]);
    expect(named["y"]).toBe("toString");
    expect(named["constructor"]).toBeUndefined();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
