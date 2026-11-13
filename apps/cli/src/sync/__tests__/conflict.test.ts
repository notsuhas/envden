import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { loadState } from "../../state/repository.ts";
import { atomicWrite } from "../../state/files.ts";

import { push, pull } from "../engine.ts";

import { diff } from "../diff.ts";
import { resolveConflict } from "../resolve.ts";

import { syncFixture } from "./flows.ts";

test("sync conflict", async () => {
  const fixture = await syncFixture();
  const { first, second, aStore, opts } = fixture;

  try {
    await pull(second, opts);
    const bStore = (await loadState(second.home))!.links[0]!.store;
    await pull(first, opts);
    await atomicWrite(aStore, "TOKEN=local-test-value\nA=remote\nB=one\n");
    await atomicWrite(bStore, "TOKEN=local-test-value\nA=mine\nB=one\n");
    expect(JSON.stringify(await diff(second, opts))).not.toContain("local-test-value");
    await push(first, opts);
    expect((await pull(second, opts)).conflicts).toBe(1);
    expect(await readFile(bStore, "utf8")).toContain("A=mine");
    await resolveConflict(second, { file: ".env", choice: "take-server" });
    expect(await readFile(bStore, "utf8")).toContain("A=remote");
  } finally {
    await fixture.cleanup();
  }
});
