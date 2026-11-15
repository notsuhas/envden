import { expect, test } from "bun:test";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { createSharedFixture } from "./shared-fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { loadState, saveState } from "../../state/store/repository.ts";
import { pull, push } from "../engine.ts";
import { conflictRecords } from "../local/conflicts.ts";
import { readBytes, basePath } from "../local/files.ts";

const fixtureClock = () => 1800000000000;

const fixture = createSharedFixture();

for (const edit of ["target", "store", "none"] as const)
  test(`failed placement resumes without reverting newer ${edit} content`, async () => {
    const f = await fixture(["copy", "copy", "link"]);
    const { targets } = f;
    const store = targets[0]!.store;
    await atomicWrite(f.aStore, "TOKEN=remote\n", fixtureClock);
    await push(f.first, f.opts);
    const placement = f.second.placement;

    f.second.placement = (mode, root) => {
      const adapter = placement(mode, root);
      if (root !== targets[1]!.root) return adapter;

      return {
        ...adapter,
        place: async () => {
          throw new Error("injected placement failure");
        },
      };
    };

    expect((await pull(f.second, f.opts)).conflicts).toBe(1);
    expect(await readBytes(basePath(f.second.home, store) + ".pending")).toBeDefined();
    const edited = edit === "store" ? store : join(targets[0]!.root, ".env");
    if (edit !== "none") await atomicWrite(edited, "TOKEN=later\n", fixtureClock);
    f.second.placement = placement;
    await pull(f.second, f.opts);

    if (edit === "none") {
      expect(await Bun.file(store).text()).toBe("TOKEN=remote\n");
      expect(await conflictRecords(f.second.home)).toEqual([]);
    } else {
      expect(await Bun.file(edited).text()).toBe("TOKEN=later\n");
      const records = await conflictRecords(f.second.home);
      if (records.length) expect(await Bun.file(records[0]!.mine).text()).toBe("TOKEN=later\n");
    }

    await pull(f.second, f.opts);
    if (edit !== "none") expect(await Bun.file(edited).text()).toBe("TOKEN=later\n");
  });

for (const step of [
  "store",
  "copy-0",
  "copy-1",
  "base-0",
  "base-1",
  "base-store",
  "applied",
] as const)
  test(`interrupted ${step} write converges on retry`, async () => {
    const { spyOn } = await import("bun:test");
    const files = await import("../../state/store/files.ts");
    const f = await fixture(["copy", "copy", "link"]);
    const { targets } = f;
    const store = targets[0]!.store;
    await atomicWrite(f.aStore, "TOKEN=remote\n", fixtureClock);
    await push(f.first, f.opts);
    let failures = 0;
    const original = files.atomicWrite;

    const paths: Record<string, string> = {
      store,
      "base-0": basePath(f.second.home, store, targets[0]!.root),
      "base-1": basePath(f.second.home, store, targets[1]!.root),
      "base-store": basePath(f.second.home, store),
      applied: join(f.second.home, "state", "applied-files.json"),
    };

    const placement = f.second.placement;

    const fault = spyOn(files, "atomicWrite").mockImplementation(async (path, bytes) => {
      if (!step.startsWith("copy") && path === paths[step] && !failures++)
        throw new Error("injected write failure");

      await original(path, bytes, fixtureClock);
    });

    f.second.placement = (mode, root) => {
      const adapter = placement(mode, root);

      return {
        ...adapter,
        place: async (...args) => {
          if (step.startsWith("copy") && root === targets[Number(step.at(-1))]!.root && !failures++)
            throw new Error("injected write failure");

          await adapter.place(...args);
        },
      };
    };

    try {
      await pull(f.second, f.opts).catch(() => undefined);
    } finally {
      fault.mockRestore();
      f.second.placement = placement;
    }

    expect(failures).toBeGreaterThan(0);
    expect((await pull(f.second, f.opts)).conflicts).toBe(0);
    expect(await Bun.file(store).text()).toBe("TOKEN=remote\n");

    for (const target of targets)
      expect(await Bun.file(join(target.root, target.path)).text()).toBe("TOKEN=remote\n");
  });

test("resumed placement skips a checkout recreated after the failed pull", async () => {
  const f = await fixture(["copy"]);
  const { targets } = f;
  const recreated = { ...f.checkoutB, root: join(f.root, "round-recreated"), mode: "copy" };
  await mkdir(recreated.root, { recursive: true });
  const state = (await loadState(f.second.home))!;
  state.approved.push(recreated);
  await saveState(f.second.home, state, fixtureClock);
  let current = state.approved;
  const ignored: string[] = [];

  f.second.repo = createFakeRepoAdapter({
    checkoutAt: async (root) => current.find((checkout) => checkout.root === root),
    ensureIgnored: async (checkout) => void ignored.push(checkout.root),
    caseInsensitive: async () => false,
  });

  await atomicWrite(f.aStore, "TOKEN=remote\n", fixtureClock);
  await push(f.first, f.opts);
  const placement = f.second.placement;

  f.second.placement = (mode, root) => {
    const adapter = placement(mode, root);
    if (root !== recreated.root) return adapter;

    return {
      ...adapter,
      place: async () => {
        throw new Error("injected placement failure");
      },
    };
  };

  await pull(f.second, f.opts);
  expect(await readBytes(basePath(f.second.home, targets[0]!.store) + ".pending")).toBeDefined();
  f.second.placement = placement;
  await rm(recreated.root, { recursive: true });
  await mkdir(recreated.root);
  current = [...state.approved.slice(0, -1), { ...recreated, identity: "recloned" }];
  ignored.length = 0;
  await pull(f.second, f.opts);

  expect(await Bun.file(join(recreated.root, ".env")).exists()).toBe(false);
  expect(ignored).not.toContain(recreated.root);
  expect(await Bun.file(join(targets[0]!.root, ".env")).text()).toBe("TOKEN=remote\n");
});
