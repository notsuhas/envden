import { expect, test } from "bun:test";
import { join } from "node:path";
import { createSharedFixture } from "./shared-fixture.ts";
import { approveLayout } from "./round-fixture.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { pull, push } from "../engine.ts";
import { conflictRecords } from "../local/conflicts.ts";
import { readBytes, basePath } from "../local/files.ts";

const fixtureClock = () => 1800000000000;

const fixture = createSharedFixture();

for (const edit of ["target", "store", "none"] as const)
  test(`failed placement resumes without reverting newer ${edit} content`, async () => {
    const f = await fixture();
    const targets = await approveLayout(f, ["copy", "copy", "link"]);
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
    const f = await fixture();
    const targets = await approveLayout(f, ["copy", "copy", "link"]);
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
