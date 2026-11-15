import { pruneHistorySafely } from "../vault/prune.ts";
import { fixture, identity } from "./fixture.ts";
import { expect, test, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serve } from "../main.ts";

test("serve injects time and shutdown removes handlers and closes storage", async () => {
  const dir = mkdtempSync(join(tmpdir(), "envden-lifecycle-"));
  const listeners = process.listenerCount("SIGTERM");
  let calls = 0;

  const running = await serve({
    dataDir: dir,
    port: 0,
    now: () => {
      calls++;

      return 1000;
    },
  });

  try {
    expect(calls).toBeGreaterThan(0);
    expect(process.listenerCount("SIGTERM")).toBe(listeners + 1);
    await running.shutdown();
    await running.shutdown();
    expect(process.listenerCount("SIGTERM")).toBe(listeners);
    expect(() => running.storage.vaultIds()).toThrow();
  } finally {
    await running.shutdown();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pruning catches failures without logging the exception", async () => {
  const f = fixture(await identity());

  const failure = spyOn(f.storage, "vaultIds").mockImplementation(() => {
    throw new Error("private detail");
  });

  const log = spyOn(console, "error").mockImplementation(() => {});

  try {
    expect(() => pruneHistorySafely(f.options)).not.toThrow();
    expect(log).toHaveBeenCalledWith("envden history pruning failed");
  } finally {
    failure.mockRestore();
    log.mockRestore();
    f.close();
  }
});

test("pruning continues past a failing vault", async () => {
  const f = fixture(await identity());
  const pruned: number[] = [];

  const ids = spyOn(f.storage, "vaultIds").mockImplementation(() => [
    new Uint8Array(32).fill(1),
    new Uint8Array(32).fill(2),
  ]);

  const prune = spyOn(f.storage, "prune").mockImplementation((vaultId) => {
    if (vaultId[0] === 1) throw new Error("private detail");
    pruned.push(vaultId[0]!);

    return { lists: 0, blobs: 0 };
  });

  const log = spyOn(console, "error").mockImplementation(() => {});

  try {
    pruneHistorySafely(f.options);
    expect(pruned).toEqual([0, 2]);
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    ids.mockRestore();
    prune.mockRestore();
    log.mockRestore();
    f.close();
  }
});
